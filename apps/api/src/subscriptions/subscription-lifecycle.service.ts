import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { DonationStatus, DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import { PaymentsService } from '../payments/payments.service';
import type { AfterCommit, AppliedPaymentEvent, PaymentEventListener } from '../payments/payments.types';
import { chargeMoment, localDateOf, nextCycleAfter, retryAt, toDbDate } from './billing-calendar';
import { SubscriptionNotifier } from './subscription-notifier.service';

const SUBSCRIPTION_SELECT = {
  id: true,
  status: true,
  amountKopecks: true,
  chargeTime: true,
  billingAnchorDate: true,
  cycleNo: true,
  failCount: true,
  user: { select: { email: true, timezone: true } },
} as const;

type LockedSubscription = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

/** Отказ без объяснения от провайдера — что показать в письме и кабинете. */
const UNKNOWN_FAILURE = 'Платёжная система не сообщила причину';

/**
 * Что происходит с подпиской, когда по её донату применилось платёжное событие.
 *
 * Работает внутри транзакции зачисления (`PaymentsService` вызывает слушателей
 * до коммита): донат и подписка меняются атомарно, а повтор колбэка
 * (`duplicate`) сюда не доходит вовсе — идемпотентность берётся из
 * `payment_event`, второй копии не нужно.
 *
 *  PARENT paid — подписка PENDING → ACTIVE, якорь = локальная дата оплаты;
 *  CHILD paid  — сброс отказов, следующий цикл от якоря;
 *  CHILD failed — отказ: повтор через 1 и 3 дня, после третьего — FAILED.
 */
@Injectable()
export class SubscriptionLifecycleService implements PaymentEventListener, OnModuleInit {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly notifier: SubscriptionNotifier,
  ) {}

  onModuleInit(): void {
    this.payments.registerListener(this);
  }

  async onEventApplied(tx: Prisma.TransactionClient, event: AppliedPaymentEvent): Promise<AfterCommit | null> {
    const donation = await tx.donation.findUnique({
      where: { id: event.donationId },
      select: { type: true, subscriptionId: true, invoiceNo: true },
    });

    if (donation === null || donation.type === DonationType.ONE_TIME || donation.subscriptionId === null) {
      return null;
    }

    const subscription = await lockSubscription(tx, donation.subscriptionId);

    if (donation.type === DonationType.PARENT) {
      return event.status === DonationStatus.paid
        ? this.activate(tx, subscription, donation.invoiceNo, event.appliedAt)
        : null;
    }

    return event.status === DonationStatus.paid
      ? this.chargeSucceeded(tx, subscription, event.appliedAt)
      : this.chargeFailed(tx, subscription, event);
  }

  private async activate(
    tx: Prisma.TransactionClient,
    subscription: LockedSubscription,
    parentInvoiceNo: number,
    paidAt: Date,
  ): Promise<AfterCommit | null> {
    if (subscription.status !== SubscriptionStatus.PENDING) {
      // Человек отменил оформление, а оплата всё же прошла (вторая вкладка).
      // Деньги зачислены как обычное пожертвование; автосписаний не будет.
      this.logger.warn(`Первый платёж подписки ${subscription.id} пришёл в статусе ${subscription.status} — не активируем`);

      return null;
    }

    const anchorDate = toDbDate(localDateOf(paidAt, subscription.user.timezone));
    const nextChargeAt = chargeMoment({
      anchorDate,
      cycleNo: 1,
      chargeTime: subscription.chargeTime,
      timeZone: subscription.user.timezone,
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        parentInvoiceNo,
        billingAnchorDate: anchorDate,
        cycleNo: 1,
        nextChargeAt,
      },
    });

    return this.notifier.started(subscription, nextChargeAt);
  }

  private async chargeSucceeded(
    tx: Prisma.TransactionClient,
    subscription: LockedSubscription,
    paidAt: Date,
  ): Promise<AfterCommit | null> {
    if (subscription.billingAnchorDate === null) {
      return null;
    }

    const schedule = {
      anchorDate: subscription.billingAnchorDate,
      chargeTime: subscription.chargeTime,
      timeZone: subscription.user.timezone,
    };
    // Обычно это просто следующий цикл; если оплата пришла с большим
    // опозданием, пропущенные циклы задним числом не списываем.
    const cycleNo = nextCycleAfter({ ...schedule, fromCycle: subscription.cycleNo + 1 }, paidAt);
    const nextChargeAt = chargeMoment({ ...schedule, cycleNo });
    const isActive = subscription.status === SubscriptionStatus.ACTIVE;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        failCount: 0,
        lastFailedAt: null,
        lastFailureReason: null,
        cycleNo,
        ...(isActive ? { nextChargeAt } : {}),
      },
    });

    return isActive ? this.notifier.chargeSucceeded(subscription, paidAt, nextChargeAt) : null;
  }

  private async chargeFailed(
    tx: Prisma.TransactionClient,
    subscription: LockedSubscription,
    event: AppliedPaymentEvent,
  ): Promise<AfterCommit | null> {
    const failCount = subscription.failCount + 1;
    const reason = (event.failureReason ?? UNKNOWN_FAILURE).slice(0, 255);
    const failure = { failCount, lastFailedAt: event.appliedAt, lastFailureReason: reason };

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      await tx.subscription.update({ where: { id: subscription.id }, data: failure });

      return null;
    }

    const retry = retryAt(failCount, event.appliedAt);

    if (retry === null) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { ...failure, status: SubscriptionStatus.FAILED },
      });

      return this.notifier.stopped(subscription, 'failed');
    }

    await tx.subscription.update({ where: { id: subscription.id }, data: { ...failure, nextChargeAt: retry } });

    return this.notifier.chargeFailed(subscription, retry, event.failureReason ?? null);
  }
}

/**
 * Строка подписки под блокировкой: колбэк, сверка планировщика и отмена
 * из кабинета могут прийти одновременно, и каждый должен видеть итог
 * предыдущего, а не своё устаревшее чтение.
 */
export async function lockSubscription(tx: Prisma.TransactionClient, id: string): Promise<LockedSubscription> {
  await tx.$queryRaw`SELECT id FROM "subscription" WHERE id = ${id}::uuid FOR UPDATE`;

  return tx.subscription.findUniqueOrThrow({ where: { id }, select: SUBSCRIPTION_SELECT });
}
