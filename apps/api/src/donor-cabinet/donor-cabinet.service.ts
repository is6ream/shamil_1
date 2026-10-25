import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { pageArgs } from '../common/pagination';
import type { Page } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { SubscriptionStatus } from '../generated/prisma/enums';
import { chargeMoment, nextCycleAfter } from '../subscriptions/billing-calendar';
import type { SubscriptionResponse, UpdateSubscriptionDto } from '../subscriptions/dto/subscription.dto';
import { lockSubscription } from '../subscriptions/subscription-lifecycle.service';
import type {
  DonorDonationResponse,
  DonorDonationsQueryDto,
  DonorProfileResponse,
  UpdateDonorProfileDto,
} from './dto/donor-cabinet.dto';

const SUBSCRIPTION_VIEW_SELECT = {
  id: true,
  status: true,
  amountKopecks: true,
  nextChargeAt: true,
  failCount: true,
  lastFailureReason: true,
  lastFailedAt: true,
  createdAt: true,
  cancelledAt: true,
  region: { select: { slug: true, name: true } },
} as const;

type SubscriptionView = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_VIEW_SELECT }>;

const NOT_FOUND = 'Подписка не найдена';

export function toSubscriptionResponse(row: SubscriptionView): SubscriptionResponse {
  return {
    id: row.id,
    status: row.status,
    amountKopecks: row.amountKopecks.toString(),
    regionSlug: row.region?.slug ?? null,
    regionName: row.region?.name ?? null,
    nextChargeAt: row.status === SubscriptionStatus.ACTIVE ? (row.nextChargeAt?.toISOString() ?? null) : null,
    failCount: row.failCount,
    lastFailureReason: row.lastFailureReason,
    lastFailedAt: row.lastFailedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

/**
 * Личный кабинет. Каждый запрос фильтруется по `userId` из токена: чужая
 * подписка неотличима от несуществующей — 404, а не 403, чтобы перебором
 * id нельзя было узнать, что такая подписка есть.
 */
@Injectable()
export class DonorCabinetService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string): Promise<DonorProfileResponse> {
    const donor = await this.prisma.donorUser.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, phoneE164: true, marketingConsent: true, createdAt: true },
    });

    return {
      id: donor.id,
      email: donor.email,
      name: donor.name,
      phone: donor.phoneE164,
      marketingConsent: donor.marketingConsent,
      createdAt: donor.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, dto: UpdateDonorProfileDto): Promise<DonorProfileResponse> {
    await this.prisma.donorUser.update({
      where: { id: userId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.phone === undefined ? {} : { phoneE164: dto.phone }),
        ...(dto.marketingConsent === undefined ? {} : { marketingConsent: dto.marketingConsent }),
      },
    });

    return this.profile(userId);
  }

  /** История пожертвований через кабинет: первые платежи и автосписания. */
  async donations(userId: string, query: DonorDonationsQueryDto): Promise<Page<DonorDonationResponse>> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          type: true,
          status: true,
          amountKopecks: true,
          paidAmountKopecks: true,
          paidAt: true,
          createdAt: true,
          subscriptionId: true,
        },
      }),
      this.prisma.donation.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amountKopecks: row.amountKopecks.toString(),
        paidAmountKopecks: row.paidAmountKopecks?.toString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        subscriptionId: row.subscriptionId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async subscriptions(userId: string): Promise<SubscriptionResponse[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: SUBSCRIPTION_VIEW_SELECT,
    });

    return rows.map(toSubscriptionResponse);
  }

  /**
   * Сумма и пауза. Новая сумма действует со следующего списания; уже
   * отправленное автосписание не меняется. Возобновление не списывает
   * пропущенные месяцы — следующий цикл берётся первым после «сейчас».
   */
  async updateSubscription(userId: string, id: string, dto: UpdateSubscriptionDto): Promise<SubscriptionResponse> {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.subscription.findUnique({ where: { id }, select: { userId: true } });

      if (owner === null || owner.userId !== userId) {
        throw new NotFoundException(NOT_FOUND);
      }

      const current = await lockSubscription(tx, id);
      const isLive = current.status === SubscriptionStatus.ACTIVE || current.status === SubscriptionStatus.PAUSED;

      if (!isLive) {
        throw new ConflictException('Изменить можно только действующую или приостановленную подписку');
      }

      const data: Prisma.SubscriptionUpdateInput = {};

      if (dto.amountKopecks !== undefined) {
        data.amountKopecks = BigInt(dto.amountKopecks);
      }

      if (dto.paused === true && current.status === SubscriptionStatus.ACTIVE) {
        data.status = SubscriptionStatus.PAUSED;
      }

      if (dto.paused === false && current.status === SubscriptionStatus.PAUSED && current.billingAnchorDate !== null) {
        const schedule = {
          anchorDate: current.billingAnchorDate,
          chargeTime: current.chargeTime,
          timeZone: current.user.timezone,
        };
        const cycleNo = nextCycleAfter({ ...schedule, fromCycle: current.cycleNo }, new Date());

        data.status = SubscriptionStatus.ACTIVE;
        data.cycleNo = cycleNo;
        data.failCount = 0;
        data.nextChargeAt = chargeMoment({ ...schedule, cycleNo });
      }

      await tx.subscription.update({ where: { id }, data });
    });

    const row = await this.prisma.subscription.findUniqueOrThrow({ where: { id }, select: SUBSCRIPTION_VIEW_SELECT });

    return toSubscriptionResponse(row);
  }

  async subscription(userId: string, id: string): Promise<SubscriptionResponse> {
    const row = await this.prisma.subscription.findFirst({ where: { id, userId }, select: SUBSCRIPTION_VIEW_SELECT });

    if (row === null) {
      throw new NotFoundException(NOT_FOUND);
    }

    return toSubscriptionResponse(row);
  }
}
