import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { MANUAL_CONFIRM_DEFAULT_METHOD, MANUAL_PROVIDER_CODE } from '../config/constants';
import { PrismaService } from '../database/prisma.service';
import { isEffectiveTransition } from '../donations/donation-status';
import { DonationStatus } from '../generated/prisma/enums';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import type { ParsedWebhook, WebhookBody } from './payment-provider.types';
import type {
  ApplyEventInput,
  ManualConfirmation,
  ManualConfirmationOptions,
  PaymentEventOutcome,
} from './payments.types';
import { MANUAL_EVENT_ID_PREFIX } from './payments.types';

/**
 * Поля колбэка, которые не сохраняются в `payment_event.payload`.
 *
 * Robokassa присылает почту плательщика. Сохранить её здесь значило бы завести
 * ПДн вне `donation_contact` — в таблице, которую не чистит удаление ПДн
 * по требованию субъекта и которая не задумывалась как хранилище персональных
 * данных (152-ФЗ, CONTEXT.md §7). Для разбора спорного платежа хватает
 * номера счёта, суммы и подписи.
 */
const REDACTED_FIELDS = new Set(['email']);
const REDACTED_MARKER = '[скрыто: ПДн]';

/** Код нарушения уникального индекса у Prisma. */
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}

/**
 * Тело колбэка для хранения. Значения приходят строками (`x-www-form-urlencoded`),
 * нестроковое — это дублированный ключ, и он тоже важен при разборе.
 */
function toStoredPayload(body: WebhookBody): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const [name, value] of Object.entries(body)) {
    payload[name] = REDACTED_FIELDS.has(name.toLowerCase())
      ? REDACTED_MARKER
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  }

  return payload;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Применение проверенного колбэка.
   *
   * Подпись к этому моменту уже сошлась — сюда попадает только то, что
   * действительно прислал провайдер. Статус и сумма берутся из колбэка,
   * а не из заказа: это единственный канал, которому можно верить.
   *
   * Сам переход живёт в `applyEvent` — общем для вебхука и для ручного
   * подтверждения из админки.
   */
  async applyWebhook(parsed: ParsedWebhook, body: WebhookBody): Promise<void> {
    const donation = await this.prisma.donation.findUnique({
      where: { invoiceNo: parsed.invoiceNo },
      select: { id: true, amountKopecks: true },
    });

    if (donation === null) {
      await this.storeUnmatchedEvent(parsed, body);

      return;
    }

    if (donation.amountKopecks !== parsed.amountKopecks) {
      // Деньги реально пришли — отказаться от них нельзя, донат станет paid
      // на фактическую сумму. Но расхождение обязано быть видно сразу:
      // молча разойтись с заказом эта строка не даёт.
      this.logger.warn(
        `Донат ${donation.id}: заказ на ${donation.amountKopecks} коп., ` +
          `оплачено ${parsed.amountKopecks} коп. Зачислено по факту оплаты.`,
      );
    }

    const outcome = await this.applyEvent({
      donationId: donation.id,
      provider: this.provider.code,
      providerEventId: parsed.providerEventId,
      status: parsed.status,
      amountKopecks: parsed.amountKopecks,
      method: parsed.method,
      payload: toStoredPayload(body),
    });

    if (outcome === 'duplicate') {
      // Агрегаторы ретраят колбэк, пока не получат 200; без ключа
      // идемпотентности донат задвоился бы и в сумме сбора, и в рейтинге.
      this.logger.log(`Повтор колбэка по счёту ${parsed.invoiceNo} — уже обработан`);
    }
  }

  /**
   * Подтверждение ручного перевода из админки.
   *
   * Запасной путь оплаты (ManualProvider) колбэков не имеет вовсе: донат висит
   * в `pending`, пока поступление не увидят в выписке. Этот метод — вторая
   * половина того пути, и он идёт ровно через ту же машинерию, что и вебхук:
   * то же событие в `payment_event`, тот же ключ идемпотентности, тот же
   * переход статуса, тот же пересчёт витрин триггером БД.
   *
   * Повторный вызов — no-op: ключ события `manual:<invoiceNo>` детерминирован,
   * второе подтверждение упирается в уникальный индекс. Поэтому и сумму
   * повтором не переписать: исправление уже зачисленного доната — отдельная
   * операция, а не побочный эффект повторного нажатия.
   */
  async confirmManual(
    donationId: string,
    options: ManualConfirmationOptions = {},
  ): Promise<ManualConfirmation> {
    const donation = await this.prisma.donation.findUnique({
      where: { id: donationId },
      // Поимённая выборка без `contact`: ПДн этой операции не нужны
      // и не должны попасть ни в ответ, ни в лог.
      select: { id: true, invoiceNo: true, provider: true, amountKopecks: true },
    });

    if (donation === null) {
      throw new NotFoundException('Донат не найден');
    }

    if (donation.provider !== MANUAL_PROVIDER_CODE) {
      // Донат агрегатора подтверждает только его колбэк. Разрешить это здесь
      // значило бы завести второй источник правды о деньгах — с правом
      // объявить оплаченным платёж, которого не было.
      throw new BadRequestException(
        `Донат оплачивается через «${donation.provider}» и подтверждается колбэком провайдера, не вручную`,
      );
    }

    const amountKopecks = options.amountKopecks ?? donation.amountKopecks;
    const method = options.method ?? MANUAL_CONFIRM_DEFAULT_METHOD;

    const outcome = await this.applyEvent({
      donationId: donation.id,
      provider: MANUAL_PROVIDER_CODE,
      providerEventId: `${MANUAL_EVENT_ID_PREFIX}${donation.invoiceNo}`,
      status: DonationStatus.paid,
      amountKopecks,
      method,
      // Кто и когда подтвердил — видно по `payment_event.received_at`;
      // имени и телефона донатера здесь нет намеренно.
      payload: {
        source: 'admin',
        method,
        confirmedAmountKopecks: amountKopecks.toString(),
        orderAmountKopecks: donation.amountKopecks.toString(),
      },
    });

    this.logger.log(`Ручной донат ${donation.id}: подтверждение — ${outcome}`);

    return this.loadConfirmation(donation.id, outcome === 'applied');
  }

  /**
   * Применение события к донату — единственное место, где меняется статус.
   *
   * Витринные счётчики (сумма сбора, рейтинг региона, цель месяца) пересчитывает
   * триггер `donation_stats_sync` — здесь их не трогаем, иначе два независимых
   * источника правды разойдутся.
   */
  private async applyEvent(input: ApplyEventInput): Promise<PaymentEventOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Статус перечитывается внутри транзакции: между поиском доната
        // и записью события могла пройти параллельная доставка.
        const current = await tx.donation.findUniqueOrThrow({
          where: { id: input.donationId },
          select: { status: true },
        });

        const isEffective = isEffectiveTransition(current.status, input.status);
        const appliedAt = isEffective ? new Date() : null;

        await tx.paymentEvent.create({
          data: {
            donationId: input.donationId,
            provider: input.provider,
            providerEventId: input.providerEventId,
            status: input.status,
            amountKopecks: input.amountKopecks,
            payload: { ...input.payload },
            // Пусто — значит событие ничего не изменило: донат уже в этом
            // статусе или переход запрещён.
            appliedAt,
          },
        });

        if (!isEffective) {
          return 'ignored';
        }

        const isPaid = input.status === DonationStatus.paid;

        await tx.donation.update({
          where: { id: input.donationId },
          data: {
            status: input.status,
            // Следы оплаты несёт только `paid` — это CHECK `donation_paid_fields`.
            // В `failed` сумма и время платежа обязаны остаться пустыми.
            paidAmountKopecks: isPaid ? input.amountKopecks : null,
            // Robokassa времени платежа в Result URL не присылает, у ручного
            // перевода его нет вовсе — фиксируем момент подтверждения.
            paidAt: isPaid ? appliedAt : null,
            ...(input.method === undefined ? {} : { method: input.method }),
          },
        });

        return 'applied';
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        // Событие с этим ключом уже записано: ретрай агрегатора или повторное
        // подтверждение из админки. И то и другое обязано быть no-op.
        return 'duplicate';
      }

      throw error;
    }
  }

  /** Состояние доната после подтверждения — то, что увидит админ в ответе. */
  private async loadConfirmation(
    donationId: string,
    applied: boolean,
  ): Promise<ManualConfirmation> {
    const stored = await this.prisma.donation.findUniqueOrThrow({
      where: { id: donationId },
      select: { id: true, status: true, paidAmountKopecks: true, paidAt: true },
    });

    return {
      orderId: stored.id,
      status: stored.status,
      paidAmountKopecks: stored.paidAmountKopecks,
      paidAt: stored.paidAt,
      applied,
    };
  }

  /**
   * Колбэк на заказ, которого у нас нет. Событие всё равно сохраняется:
   * деньги где-то есть, и это единственное, с чем можно идти в поддержку
   * провайдера. Ретраи такой платёж не восстановят, поэтому ответ всё равно
   * успешный — иначе шторм повторов забьёт и логи, и очередь провайдера.
   */
  private async storeUnmatchedEvent(parsed: ParsedWebhook, body: WebhookBody): Promise<void> {
    this.logger.error(
      `Колбэк с верной подписью на неизвестный счёт ${parsed.invoiceNo} ` +
        `на ${parsed.amountKopecks} коп. Событие сохранено, донат не найден.`,
    );

    try {
      await this.prisma.paymentEvent.create({
        data: {
          provider: this.provider.code,
          providerEventId: parsed.providerEventId,
          status: parsed.status,
          amountKopecks: parsed.amountKopecks,
          payload: toStoredPayload(body),
        },
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}
