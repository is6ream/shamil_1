import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { DonationStatus, DonationType } from '../generated/prisma/enums';
import { PaymentsService } from '../payments/payments.service';
import { RECURRING_GATEWAY } from '../payments/recurring/recurring-gateway';
import type { ChargeState, RecurringGateway } from '../payments/recurring/recurring-gateway';

/** Подписок за один тик. Остальные возьмёт следующий тик или другой экземпляр. */
const CLAIM_BATCH = 20;

/** Висящих автосписаний на сверку за тик — OpStateExt дёргаем умеренно. */
const RECONCILE_BATCH = 50;

/** Ключи событий отказа — отдельно от ключа успеха (номер счёта), чтобы поздний успех не упёрся в индекс. */
const REJECTED_EVENT_PREFIX = 'recurring-rejected:';
const FAILED_EVENT_PREFIX = 'recurring-failed:';

const NOT_DELIVERED_REASON = 'Списание не дошло до платёжной системы';

/**
 * Допуск на расхождение часов приложения и БД: `created_at` ставит база,
 * и только что созданный CHILD иначе не попал бы в сверку того же тика
 * у шлюза без задержки (имитация, эмулятор).
 */
const CLOCK_SKEW_MS = 5_000;

/** Автосписание висит дольше — пишем в лог: это уже не задержка колбэка. */
const STUCK_AFTER_MS = 3 * 24 * 60 * 60_000;

interface ClaimedCharge {
  readonly donationId: string;
  readonly invoiceNo: number;
  readonly previousInvoiceNo: number;
  readonly amountKopecks: bigint;
}

interface DueRow {
  readonly id: string;
  readonly user_id: string;
  readonly campaign_id: string;
  readonly region_id: string | null;
  readonly amount_kopecks: bigint;
  readonly parent_invoice_no: number;
  readonly next_charge_at: Date;
}

export interface TickResult {
  readonly claimed: number;
  readonly submitted: number;
  readonly reconciled: number;
}

/**
 * Автосписания по расписанию.
 *
 * Защита от двойного списания держится на базе, а не на памяти процесса:
 * на Timeweb App Platform экземпляров может быть несколько, и каждый крутит
 * свой планировщик.
 *  - `SELECT … FOR UPDATE SKIP LOCKED` — два экземпляра не возьмут одну подписку;
 *  - `NOT EXISTS pending CHILD` + уникальный индекс
 *    `donation_one_pending_child_per_subscription` — даже если взяли,
 *    второй pending CHILD не запишется, и второго запроса в Robokassa не будет.
 *
 * CHILD-донат создаётся и коммитится ДО запроса к провайдеру: если процесс
 * упадёт посередине, висящее автосписание найдёт сверка (`reconcile`),
 * а не повторное списание.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(RECURRING_GATEWAY) private readonly gateway: RecurringGateway | null,
  ) {}

  async runTick(now: Date = new Date()): Promise<TickResult> {
    if (this.gateway === null) {
      return { claimed: 0, submitted: 0, reconciled: 0 };
    }

    const claimed = await this.claimDueCharges(this.gateway, now);
    let submitted = 0;

    for (const charge of claimed) {
      submitted += (await this.submit(this.gateway, charge)) ? 1 : 0;
    }

    const reconciled = await this.reconcile(this.gateway, now);

    return { claimed: claimed.length, submitted, reconciled };
  }

  /** Подписки, которым пора списываться → pending CHILD. Одна транзакция, коммит до внешних вызовов. */
  private async claimDueCharges(gateway: RecurringGateway, now: Date): Promise<readonly ClaimedCharge[]> {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<DueRow[]>`
        SELECT s.id, s.user_id, s.campaign_id, s.region_id, s.amount_kopecks,
               s.parent_invoice_no, s.next_charge_at
          FROM "subscription" s
         WHERE s.status = 'ACTIVE'
           AND s.next_charge_at <= ${now}
           AND NOT EXISTS (
                 SELECT 1 FROM "donation" d
                  WHERE d.subscription_id = s.id AND d.type = 'CHILD' AND d.status = 'pending')
         ORDER BY s.next_charge_at
         LIMIT ${CLAIM_BATCH}
           FOR UPDATE OF s SKIP LOCKED`;

      const charges: ClaimedCharge[] = [];

      for (const row of due) {
        const child = await tx.donation.create({
          data: {
            campaignId: row.campaign_id,
            regionId: row.region_id,
            regionSource: row.region_id === null ? null : 'form',
            amountKopecks: row.amount_kopecks,
            provider: gateway.providerCode,
            type: DonationType.CHILD,
            subscriptionId: row.id,
            userId: row.user_id,
            isAnonymous: true,
          },
          select: { id: true, invoiceNo: true },
        });

        await tx.subscription.update({ where: { id: row.id }, data: { lastScheduledAt: row.next_charge_at } });

        charges.push({
          donationId: child.id,
          invoiceNo: child.invoiceNo,
          previousInvoiceNo: row.parent_invoice_no,
          amountKopecks: row.amount_kopecks,
        });
      }

      return charges;
    });
  }

  /** Запрос списания. `false` — провайдер отказал сразу или недоступен. */
  private async submit(gateway: RecurringGateway, charge: ClaimedCharge): Promise<boolean> {
    try {
      const result = await gateway.submit({
        invoiceNo: charge.invoiceNo,
        previousInvoiceNo: charge.previousInvoiceNo,
        amountKopecks: charge.amountKopecks,
        description: 'Ежемесячное пожертвование на строительство мечети «Шамиль»',
      });

      await this.prisma.donation.update({
        where: { id: charge.donationId },
        data: { providerPaymentId: String(charge.invoiceNo) },
      });

      if (!result.accepted) {
        await this.fail(gateway, charge.donationId, charge.amountKopecks, `${REJECTED_EVENT_PREFIX}${charge.invoiceNo}`, result.reason);

        return false;
      }

      return true;
    } catch (error: unknown) {
      // Неизвестно, дошёл ли запрос. Повторять нельзя — это может быть
      // двойное списание; висящий CHILD разберёт сверка по OpStateExt.
      this.logger.error(
        `Автосписание по счёту ${charge.invoiceNo}: исход неизвестен, ждёт сверки`,
        error instanceof Error ? error.message : String(error),
      );

      return false;
    }
  }

  /** Сверка висящих автосписаний: отказ на Result URL не приходит никогда. */
  private async reconcile(gateway: RecurringGateway, now: Date): Promise<number> {
    const pending = await this.prisma.donation.findMany({
      where: {
        type: DonationType.CHILD,
        status: DonationStatus.pending,
        createdAt: { lte: new Date(Math.max(now.getTime(), Date.now()) - gateway.reconcileDelayMs + CLOCK_SKEW_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: RECONCILE_BATCH,
      select: { id: true, invoiceNo: true, amountKopecks: true, createdAt: true },
    });
    let resolved = 0;

    for (const donation of pending) {
      try {
        const state = await gateway.checkState(donation.invoiceNo);

        resolved += (await this.applyState(gateway, donation, state, now)) ? 1 : 0;
      } catch (error: unknown) {
        this.logger.error(
          `Сверка автосписания по счёту ${donation.invoiceNo} не удалась`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return resolved;
  }

  private async applyState(
    gateway: RecurringGateway,
    donation: { id: string; invoiceNo: number; amountKopecks: bigint; createdAt: Date },
    state: ChargeState,
    now: Date,
  ): Promise<boolean> {
    switch (state.kind) {
      case 'paid':
        // Ключ — номер счёта, как у Result URL: поздний колбэк ляжет повтором.
        await this.payments.applyGatewayEvent({
          donationId: donation.id,
          provider: gateway.providerCode,
          providerEventId: String(donation.invoiceNo),
          status: DonationStatus.paid,
          amountKopecks: state.amountKopecks ?? donation.amountKopecks,
          payload: { source: 'reconcile', invoiceNo: String(donation.invoiceNo) },
        });

        return true;

      case 'failed':
        await this.fail(gateway, donation.id, donation.amountKopecks, `${FAILED_EVENT_PREFIX}${donation.invoiceNo}`, state.reason);

        return true;

      case 'not_found':
        await this.fail(gateway, donation.id, donation.amountKopecks, `${FAILED_EVENT_PREFIX}${donation.invoiceNo}`, NOT_DELIVERED_REASON);

        return true;

      case 'pending':
        if (now.getTime() - donation.createdAt.getTime() > STUCK_AFTER_MS) {
          this.logger.warn(`Автосписание по счёту ${donation.invoiceNo} в работе у провайдера дольше трёх дней`);
        }

        return false;
    }
  }

  private async fail(
    gateway: RecurringGateway,
    donationId: string,
    amountKopecks: bigint,
    eventId: string,
    reason: string,
  ): Promise<void> {
    await this.payments.applyGatewayEvent({
      donationId,
      provider: gateway.providerCode,
      providerEventId: eventId,
      status: DonationStatus.failed,
      amountKopecks,
      payload: { source: 'billing', reason },
      failureReason: reason,
    });
  }
}
