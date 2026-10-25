import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { PrismaService } from '../database/prisma.service';
import type { DonorPrincipal } from '../donor-auth/donor-auth.types';
import { DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import { PaymentProviderResolver } from '../payments/payment-provider.resolver';
import type { Prisma } from '../generated/prisma/client';
import { RECURRING_GATEWAY } from '../payments/recurring/recurring-gateway';
import type { RecurringGateway } from '../payments/recurring/recurring-gateway';
import { lockSubscription } from './subscription-lifecycle.service';
import { SubscriptionNotifier } from './subscription-notifier.service';
import type { CreateSubscriptionDto, CreatedSubscriptionResponse } from './dto/subscription.dto';
import { RECURRING_UNAVAILABLE_MESSAGE } from './subscriptions.constants';
import type { CancelSource } from './subscriptions.constants';

/** Регион и источник атрибуции пишутся только вместе — CHECK `donation_region_source_consistency`. */
const REGION_SOURCE_FORM = 'form';

/** Запись журнала в транзакции отмены; получает статус до отмены. */
export type OnCancelled = (tx: Prisma.TransactionClient, previousStatus: SubscriptionStatus) => Promise<void>;

export interface CancelResult {
  readonly id: string;
  /** `false` — подписка уже была отменена, повтор ничего не изменил. */
  readonly changed: boolean;
}

/**
 * Оформление и отмена ежемесячных пожертвований.
 *
 * Оформление — та же двухшаговая схема, что у разового доната: сервер сам
 * создаёт заказ (подписка PENDING + PARENT-донат) и сам подписывает ссылку
 * с `Recurring=true`. Активирует подписку только Result URL первого платежа.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderResolver,
    @Inject(RECURRING_GATEWAY) private readonly gateway: RecurringGateway | null,
    private readonly notifier: SubscriptionNotifier,
  ) {}

  async create(donor: DonorPrincipal, dto: CreateSubscriptionDto, consentIp?: string): Promise<CreatedSubscriptionResponse> {
    // Без шлюза автосписаний (production с manual) оформлять нечего:
    // первый платёж прошёл бы, а второго не случилось бы никогда.
    const provider = this.gateway === null ? null : this.providers.byCode(this.gateway.providerCode);

    if (provider === null) {
      throw new BadRequestException(RECURRING_UNAVAILABLE_MESSAGE);
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: { slug: CAMPAIGN_SLUG, isActive: true },
      select: { id: true, title: true, minDonationKopecks: true },
    });

    if (campaign === null) {
      throw new NotFoundException('Активный сбор не найден');
    }

    const amountKopecks = BigInt(dto.amountKopecks);

    if (amountKopecks < campaign.minDonationKopecks) {
      throw new BadRequestException(`Минимальная сумма пожертвования — ${campaign.minDonationKopecks / 100n} ₽`);
    }

    const regionId = await this.resolveRegionId(dto.regionSlug);
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      // Незавершённое оформление заменяется новым: две «ждущие оплаты»
      // подписки в кабинете — путаница, а не выбор.
      await tx.subscription.updateMany({
        where: { userId: donor.id, status: SubscriptionStatus.PENDING },
        data: { status: SubscriptionStatus.CANCELLED, cancelledAt: now, cancelSource: 'donor' },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId: donor.id,
          campaignId: campaign.id,
          regionId,
          amountKopecks,
          consentAcceptedAt: now,
          consentIp: consentIp ?? null,
        },
        select: { id: true },
      });

      const parent = await tx.donation.create({
        data: {
          campaignId: campaign.id,
          regionId,
          regionSource: regionId === null ? null : REGION_SOURCE_FORM,
          amountKopecks,
          provider: provider.code,
          type: DonationType.PARENT,
          subscriptionId: subscription.id,
          userId: donor.id,
          // Подписчики в публичный топ не попадают по умолчанию — как и разовые
          // (садака — скрытое поклонение, CLAUDE.md).
          isAnonymous: true,
        },
        select: { id: true, invoiceNo: true },
      });

      return { subscriptionId: subscription.id, parent };
    });

    // Внешний вызов — за пределами транзакции, как у разового доната.
    const payment = await provider.createPayment({
      invoiceNo: created.parent.invoiceNo,
      donationId: created.parent.id,
      amountKopecks,
      description: `Ежемесячное пожертвование: ${campaign.title}`,
      recurring: true,
    });

    await this.prisma.donation.update({
      where: { id: created.parent.id },
      data: { providerPaymentId: payment.externalId },
    });

    return { subscriptionId: created.subscriptionId, orderId: created.parent.id, redirectUrl: payment.redirectUrl };
  }

  /**
   * Отмена — одна для кабинета, ссылки из письма и админки. Повтор — no-op.
   * `ownerId` — фильтр владельца: чужая подписка неотличима от несуществующей (404).
   * Уже отправленное автосписание отменой не отзывается — его исход
   * просто запишется в историю.
   */
  async cancel(
    id: string,
    source: CancelSource,
    options: { readonly ownerId?: string; readonly onCancelled?: OnCancelled } = {},
  ): Promise<CancelResult> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.subscription.findUnique({ where: { id }, select: { userId: true } });

      if (owner === null || (options.ownerId !== undefined && owner.userId !== options.ownerId)) {
        throw new NotFoundException('Подписка не найдена');
      }

      const subscription = await lockSubscription(tx, id);

      if (subscription.status === SubscriptionStatus.CANCELLED) {
        return { changed: false, notify: null };
      }

      await tx.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), cancelSource: source },
      });

      if (options.onCancelled !== undefined) {
        await options.onCancelled(tx, subscription.status);
      }

      // Неоплаченное оформление — не подписка: письмо «остановлено» о нём только путает.
      const notify =
        subscription.status === SubscriptionStatus.PENDING ? null : this.notifier.stopped(subscription, 'cancelled');

      return { changed: true, notify };
    });

    if (outcome.notify !== null) {
      // Отмена уже записана; несостоявшееся письмо её не откатывает.
      await outcome.notify().catch((error: unknown) => {
        this.logger.error(`Письмо об отмене подписки ${id} не отправлено`, error instanceof Error ? error.stack : String(error));
      });
    }

    return { id, changed: outcome.changed };
  }

  private async resolveRegionId(slug: string | undefined): Promise<string | null> {
    if (slug === undefined) {
      return null;
    }

    const region = await this.prisma.region.findFirst({ where: { slug, isActive: true }, select: { id: true } });

    // Регион не найден — подписка всё равно оформляется: платёж важнее статистики.
    return region?.id ?? null;
  }
}
