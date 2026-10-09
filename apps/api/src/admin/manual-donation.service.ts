import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { KOPECKS_IN_RUBLE, MANUAL_PROVIDER_CODE, MAX_MANUAL_CONFIRM_KOPECKS } from '../config/constants';
import { PrismaService } from '../database/prisma.service';
import { isUniqueViolation } from '../database/prisma-errors';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { DonationStatus } from '../generated/prisma/enums';
import type { ManualDonationDto } from './dto/manual-donation.dto';

/**
 * Префикс ключа ручного поступления: `admin-manual:<uuid>`. Ложится и в
 * `donation.provider_payment_id`, и в `payment_event.provider_event_id` —
 * оба уникальны в паре с провайдером, и повтор формы упирается в индекс.
 * Отличается от `manual:<invoiceNo>` подтверждения перевода: это разные операции.
 */
export const MANUAL_DONATION_KEY_PREFIX = 'admin-manual:';

/** Дата поступления не может быть в будущем; минута запаса — на расхождение часов. */
const CLOCK_SKEW_MS = 60_000;

export interface ManualDonationResponse {
  readonly orderId: string;
  readonly invoiceNo: number;
  readonly status: DonationStatus;
  readonly paidAmountKopecks: string;
  readonly paidAt: string;
  /** `false` — повтор формы с тем же ключом: донат уже был, второго зачисления нет. */
  readonly applied: boolean;
}

interface Parsed {
  readonly amountKopecks: bigint;
  readonly paidAt: Date;
  readonly isAnonymous: boolean;
  readonly donorName: string | null;
}

@Injectable()
export class ManualDonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ручное поступление: донат вставляется сразу в `paid` — триггер
   * `donation_stats_sync` учитывает такую вставку так же, как вебхук,
   * и двигает сумму сбора, рейтинг региона и цель месяца.
   */
  async create(dto: ManualDonationDto, actor: AdminPrincipal, meta: RequestMeta): Promise<ManualDonationResponse> {
    const parsed = parse(dto);
    const key = `${MANUAL_DONATION_KEY_PREFIX}${dto.idempotencyKey}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.findUnique({ where: { slug: CAMPAIGN_SLUG }, select: { id: true } });

        if (campaign === null) {
          throw new NotFoundException('Сбор не найден — запустите сиды');
        }

        const region =
          dto.regionSlug === undefined || dto.regionSlug === null
            ? null
            : await tx.region.findUnique({ where: { slug: dto.regionSlug }, select: { id: true } });

        if (dto.regionSlug !== undefined && dto.regionSlug !== null && region === null) {
          throw new BadRequestException('Регион не найден');
        }

        const donation = await tx.donation.create({
          data: {
            campaignId: campaign.id,
            status: DonationStatus.paid,
            amountKopecks: parsed.amountKopecks,
            paidAmountKopecks: parsed.amountKopecks,
            paidAt: parsed.paidAt,
            provider: MANUAL_PROVIDER_CODE,
            providerPaymentId: key,
            method: dto.method,
            regionId: region?.id ?? null,
            // Регион и источник атрибуции пишутся только вместе — это CHECK.
            regionSource: region === null ? null : 'admin',
            isAnonymous: parsed.isAnonymous,
            donorName: parsed.donorName,
            adminComment: dto.comment,
          },
          select: { id: true, invoiceNo: true, status: true, paidAmountKopecks: true, paidAt: true },
        });

        await tx.paymentEvent.create({
          data: {
            donationId: donation.id,
            provider: MANUAL_PROVIDER_CODE,
            providerEventId: key,
            status: DonationStatus.paid,
            amountKopecks: parsed.amountKopecks,
            payload: { source: 'admin-manual', method: dto.method, amountKopecks: parsed.amountKopecks.toString() },
            appliedAt: new Date(),
          },
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'donation.manual_create',
          entityType: 'donation',
          entityId: donation.id,
          after: {
            amountKopecks: parsed.amountKopecks,
            method: dto.method,
            paidAt: parsed.paidAt,
            regionSlug: dto.regionSlug ?? null,
            isAnonymous: parsed.isAnonymous,
            donorName: parsed.donorName,
            comment: dto.comment,
            idempotencyKey: dto.idempotencyKey,
          },
          meta,
        });

        return {
          orderId: donation.id,
          invoiceNo: donation.invoiceNo,
          status: donation.status,
          paidAmountKopecks: parsed.amountKopecks.toString(),
          paidAt: parsed.paidAt.toISOString(),
          applied: true,
        };
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        return this.replay(key, dto, parsed);
      }

      throw error;
    }
  }

  /**
   * Повтор с тем же ключом. Те же сумма и способ — возвращаем уже созданный
   * донат (кнопку нажали дважды, сеть оборвалась). Другие — 409: под одним
   * ключом не может быть двух разных поступлений.
   */
  private async replay(key: string, dto: ManualDonationDto, parsed: Parsed): Promise<ManualDonationResponse> {
    const existing = await this.prisma.donation.findUnique({
      where: { provider_providerPaymentId: { provider: MANUAL_PROVIDER_CODE, providerPaymentId: key } },
      select: { id: true, invoiceNo: true, status: true, paidAmountKopecks: true, paidAt: true, method: true },
    });

    if (existing === null || existing.paidAmountKopecks === null || existing.paidAt === null) {
      throw new ConflictException('Ключ идемпотентности уже использован');
    }

    if (existing.paidAmountKopecks !== parsed.amountKopecks || existing.method !== dto.method) {
      throw new ConflictException('С этим ключом уже внесено другое поступление — обновите форму');
    }

    return {
      orderId: existing.id,
      invoiceNo: existing.invoiceNo,
      status: existing.status,
      paidAmountKopecks: existing.paidAmountKopecks.toString(),
      paidAt: existing.paidAt.toISOString(),
      applied: false,
    };
  }
}

function parse(dto: ManualDonationDto): Parsed {
  const amountKopecks = BigInt(dto.amountKopecks);

  if (amountKopecks > MAX_MANUAL_CONFIRM_KOPECKS) {
    // Лишний ноль в форме уехал бы прямо в сумму сбора на главной.
    throw new BadRequestException(
      `Сумма не может превышать ${MAX_MANUAL_CONFIRM_KOPECKS / BigInt(KOPECKS_IN_RUBLE)} ₽`,
    );
  }

  const paidAt = dto.paidAt === undefined ? new Date() : new Date(dto.paidAt);

  if (paidAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
    throw new BadRequestException('Дата поступления в будущем');
  }

  const isAnonymous = dto.isAnonymous ?? true;
  const donorName = dto.donorName ?? null;

  if (isAnonymous && donorName !== null) {
    // У анонимного доната публичной подписи нет вовсе — это CHECK в БД.
    throw new BadRequestException('У анонимного пожертвования подписи быть не может');
  }

  return { amountKopecks, paidAt, isAnonymous, donorName };
}
