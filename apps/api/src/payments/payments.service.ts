import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { isEffectiveTransition } from '../donations/donation-status';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import type { ParsedWebhook, WebhookBody } from './payment-provider.types';

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
   * Витринные счётчики (сумма сбора, рейтинг региона, цель месяца)
   * пересчитывает триггер `donation_stats_sync` — здесь их не трогаем,
   * иначе два независимых источника правды разойдутся.
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

    try {
      await this.applyInTransaction(parsed, body);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        // Повторная доставка того же события. Агрегаторы ретраят колбэк,
        // пока не получат 200; без этого ветвления донат задвоился бы
        // и в сумме сбора, и в рейтинге региона.
        this.logger.log(`Повтор колбэка по счёту ${parsed.invoiceNo} — уже обработан`);

        return;
      }

      throw error;
    }
  }

  private async applyInTransaction(parsed: ParsedWebhook, body: WebhookBody): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Статус перечитывается внутри транзакции: между поиском доната
      // и записью события могла пройти параллельная доставка.
      const current = await tx.donation.findUniqueOrThrow({
        where: { invoiceNo: parsed.invoiceNo },
        select: { id: true, status: true },
      });

      const isEffective = isEffectiveTransition(current.status, parsed.status);
      const appliedAt = isEffective ? new Date() : null;

      await tx.paymentEvent.create({
        data: {
          donationId: current.id,
          provider: this.provider.code,
          providerEventId: parsed.providerEventId,
          status: parsed.status,
          amountKopecks: parsed.amountKopecks,
          payload: toStoredPayload(body),
          // Пусто — значит событие ничего не изменило: донат уже в этом
          // статусе или переход запрещён.
          appliedAt,
        },
      });

      if (!isEffective) {
        return;
      }

      await tx.donation.update({
        where: { id: current.id },
        data: {
          status: parsed.status,
          paidAmountKopecks: parsed.amountKopecks,
          // Robokassa времени платежа в Result URL не присылает — фиксируем
          // момент подтверждения.
          paidAt: appliedAt,
          ...(parsed.method === undefined ? {} : { method: parsed.method }),
        },
      });
    });
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
