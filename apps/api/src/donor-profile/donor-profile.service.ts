import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { isUniqueViolation } from '../database/prisma-errors';
import { FRESH_SESSION_MS } from '../donor-auth/donor-auth.constants';
import type { DonorPrincipal, DonorRequestMeta } from '../donor-auth/donor-auth.types';
import { DonorCodeService } from '../donor-auth/donor-code.service';
import { DonorSessionService } from '../donor-auth/donor-session.service';
import type { Prisma } from '../generated/prisma/client';
import { DonationStatus, DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import { localDateOf, yearBounds } from '../subscriptions/billing-calendar';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type {
  DeleteChallengeResponse,
  DonorProfileResponse,
  DonorSummaryResponse,
  UpdateDonorProfileDto,
} from './dto/donor-profile.dto';

const PROFILE_SELECT = {
  id: true,
  email: true,
  vkUserId: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phoneE164: true,
  city: true,
  showInFeed: true,
  createdAt: true,
  region: { select: { id: true, slug: true, name: true, type: true, parent: { select: { name: true } } } },
} as const satisfies Prisma.DonorUserSelect;

type ProfileRow = Prisma.DonorUserGetPayload<{ select: typeof PROFILE_SELECT }>;

/** Подписки, которые ещё могут списать деньги или ждут первого платежа. */
const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.FAILED,
];

const EMAIL_TAKEN = 'Этот адрес уже привязан к другому кабинету';

function toProfile(row: ProfileRow): DonorProfileResponse {
  return {
    id: row.id,
    email: row.email,
    vkLinked: row.vkUserId !== null,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName,
    phone: row.phoneE164,
    region:
      row.region === null
        ? null
        : {
            id: row.region.id,
            slug: row.region.slug,
            name: row.region.name,
            type: row.region.type,
            countryName: row.region.parent?.name ?? null,
          },
    city: row.city,
    showInFeed: row.showInFeed,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Профиль жертвователя: карточка, личные данные, почта, согласие на показ
 * в ленте, удаление. `donorId` всегда из сессии — параметром его не передать.
 */
@Injectable()
export class DonorProfileService {
  private readonly logger = new Logger(DonorProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: DonorCodeService,
    private readonly sessions: DonorSessionService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async profile(donorId: string): Promise<DonorProfileResponse> {
    return toProfile(await this.prisma.donorUser.findUniqueOrThrow({ where: { id: donorId }, select: PROFILE_SELECT }));
  }

  async summary(donorId: string, now: Date = new Date()): Promise<DonorSummaryResponse> {
    const donor = await this.prisma.donorUser.findUniqueOrThrow({
      where: { id: donorId },
      select: { createdAt: true, timezone: true },
    });
    const year = localDateOf(now, donor.timezone).year;
    const bounds = yearBounds(year, donor.timezone);
    const paid = { userId: donorId, status: DonationStatus.paid };
    const [yearTotal, donationsCount, activeSubscriptions] = await this.prisma.$transaction([
      this.prisma.donation.aggregate({
        where: { ...paid, paidAt: { gte: bounds.from, lt: bounds.to } },
        _sum: { paidAmountKopecks: true },
      }),
      this.prisma.donation.count({ where: paid }),
      this.prisma.subscription.count({ where: { userId: donorId, status: SubscriptionStatus.ACTIVE } }),
    ]);

    return {
      year,
      yearTotalKopecks: (yearTotal._sum.paidAmountKopecks ?? 0n).toString(),
      donationsCount,
      memberSince: donor.createdAt.toISOString(),
      hasActiveSubscription: activeSubscriptions > 0,
    };
  }

  /**
   * Сохранение настроек. Отзыв согласия на показ в ленте скрывает имя и
   * в уже опубликованных пожертвованиях: подпись стирается, а не прячется
   * фильтром, — чего нет в строке, того не покажет никакой запрос.
   */
  async update(donorId: string, dto: UpdateDonorProfileDto): Promise<DonorProfileResponse> {
    const regionId = await this.resolveRegionId(dto.regionSlug);

    await this.prisma.$transaction(async (tx) => {
      await tx.donorUser.update({
        where: { id: donorId },
        data: {
          ...(dto.firstName === undefined ? {} : { firstName: dto.firstName }),
          ...(dto.lastName === undefined ? {} : { lastName: dto.lastName }),
          ...(dto.middleName === undefined ? {} : { middleName: dto.middleName }),
          ...(dto.phone === undefined ? {} : { phoneE164: dto.phone }),
          ...(regionId === undefined ? {} : { regionId }),
          ...(dto.city === undefined ? {} : { city: dto.city }),
          ...(dto.showInFeed === undefined ? {} : { showInFeed: dto.showInFeed }),
        },
      });

      if (dto.showInFeed === false) {
        await hideFromFeed(tx, donorId);
      }
    });

    return this.profile(donorId);
  }

  /** Код на новый адрес. Ответ одинаков: занят адрес или нет, узнают только после кода. */
  async requestEmailChange(donor: DonorPrincipal, email: string, meta: DonorRequestMeta): Promise<void> {
    if (email === donor.email) {
      return;
    }

    await this.codes.issue({ purpose: 'change_email', email, donorId: donor.id }, meta.ip);
  }

  async confirmEmailChange(donor: DonorPrincipal, email: string, code: string): Promise<DonorProfileResponse> {
    await this.codes.consume({ purpose: 'change_email', email, donorId: donor.id }, code);

    try {
      await this.prisma.donorUser.update({ where: { id: donor.id }, data: { email } });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(EMAIL_TAKEN);
      }

      throw error;
    }

    return this.profile(donor.id);
  }

  /** Отвязать VK можно, только если остаётся почта: иначе в кабинет больше не войти. */
  async unlinkVk(donorId: string): Promise<DonorProfileResponse> {
    const updated = await this.prisma.donorUser.updateMany({
      where: { id: donorId, email: { not: null } },
      data: { vkUserId: null },
    });

    if (updated.count === 0) {
      throw new ConflictException('Сначала добавьте почту — иначе войти в кабинет будет нечем');
    }

    return this.profile(donorId);
  }

  /**
   * Первый шаг удаления. С почтой — код на неё. Без почты (вошёл через VK)
   * подтверждением служит свежий вход: человек только что прошёл VK ID.
   */
  async requestDeletion(donor: DonorPrincipal, meta: DonorRequestMeta): Promise<DeleteChallengeResponse> {
    if (donor.email === null) {
      return { method: 'fresh_login' };
    }

    await this.codes.issue({ purpose: 'delete_account', email: donor.email, donorId: donor.id }, meta.ip);

    return { method: 'email' };
  }

  /**
   * Удаление — обезличивание. Подписки отменяются, донаты остаются в учёте
   * мечети без привязки к человеку и без подписи в ленте (платежи подписки —
   * на обезличенной строке, см. ниже), ПДн стираются,
   * все сессии гаснут. Строка аккаунта остаётся только ради заявок на справки,
   * которые уже в работе у бухгалтера.
   */
  async delete(donor: DonorPrincipal, code: string | undefined, now: Date = new Date()): Promise<void> {
    await this.confirmDeletion(donor, code, now);

    const live = await this.prisma.subscription.findMany({
      where: { userId: donor.id, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      select: { id: true },
    });

    // Отмена — тем же путём, что кнопка в кабинете: с письмом и сторожем статуса.
    for (const subscription of live) {
      await this.subscriptions.cancel(subscription.id, 'donor', { ownerId: donor.id });
    }

    await this.prisma.$transaction(async (tx) => {
      await hideFromFeed(tx, donor.id);
      // Разовые отвязываются совсем. Платежи подписки по CHECK обязаны
      // ссылаться на владельца — они остаются на обезличенной строке,
      // в которой не осталось ничего о человеке.
      await tx.donation.updateMany({ where: { userId: donor.id, type: DonationType.ONE_TIME }, data: { userId: null } });
      await tx.donorAuthCode.deleteMany({ where: { donorId: donor.id } });
      await tx.donorOauthState.deleteMany({ where: { donorId: donor.id } });
      await this.sessions.revokeAll(tx, donor.id, now);
      await tx.donorUser.update({
        where: { id: donor.id },
        data: {
          email: null,
          vkUserId: null,
          phoneE164: null,
          firstName: null,
          lastName: null,
          middleName: null,
          city: null,
          regionId: null,
          showInFeed: false,
          marketingConsent: false,
          deletedAt: now,
        },
      });
    });

    this.logger.log(`Кабинет ${donor.id} обезличен по просьбе владельца`);
  }

  /** slug → id. `undefined` — поле не трогали, `null` — стереть регион. */
  private async resolveRegionId(slug: string | null | undefined): Promise<string | null | undefined> {
    if (slug === undefined || slug === null) {
      return slug;
    }

    const region = await this.prisma.region.findFirst({ where: { slug, isActive: true }, select: { id: true } });

    if (region === null) {
      throw new BadRequestException('regionSlug — такого региона нет в справочнике');
    }

    return region.id;
  }

  private async confirmDeletion(donor: DonorPrincipal, code: string | undefined, now: Date): Promise<void> {
    if (donor.email !== null) {
      if (code === undefined) {
        throw new BadRequestException('code — введите код из письма');
      }

      await this.codes.consume({ purpose: 'delete_account', email: donor.email, donorId: donor.id }, code, now);

      return;
    }

    const session = await this.sessions.findActive(donor.id, donor.sessionId, now);

    if (now.getTime() - session.createdAt.getTime() > FRESH_SESSION_MS) {
      throw new ForbiddenException('Для удаления войдите через VK ещё раз — так мы убедимся, что это вы');
    }
  }
}

/** Подпись стирается во всех донатах человека: CHECK требует пустую подпись у анонимного. */
async function hideFromFeed(tx: Prisma.TransactionClient, donorId: string): Promise<void> {
  await tx.donation.updateMany({
    where: { userId: donorId, isAnonymous: false },
    data: { isAnonymous: true, donorName: null },
  });
}
