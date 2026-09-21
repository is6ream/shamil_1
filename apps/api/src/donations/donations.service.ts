import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { PrismaService } from '../database/prisma.service';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.interface';
import type { PaymentProvider } from '../payments/payment-provider.interface';
import type { CreateDonationDto } from './dto/create-donation.dto';
import type {
  CreatedDonationResponse,
  DonationStatusResponse,
} from './dto/donation-response.dto';

/** Источник региона по умолчанию: пришёл из селектора формы, а не из ссылки. */
const DEFAULT_REGION_SOURCE = 'form';

interface ResolvedRegion {
  readonly regionId: string | null;
  readonly regionSource: string | null;
}

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Двухшаговая схема из CLAUDE.md: сервер создаёт заказ, сам назначает сумму
   * и сам формирует подписанную ссылку. Сумма, пришедшая от клиента, для
   * списания не используется никогда — только для проверки диапазона.
   */
  async create(dto: CreateDonationDto, consentIp?: string): Promise<CreatedDonationResponse> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { slug: CAMPAIGN_SLUG, isActive: true },
      select: { id: true, title: true, minDonationKopecks: true },
    });

    if (campaign === null) {
      throw new NotFoundException('Активный сбор не найден');
    }

    const amountKopecks = BigInt(dto.amountKopecks);

    // Минимум живёт в БД и меняется без миграции — значит, и проверять его
    // нужно по базе, а не по константе сборки.
    if (amountKopecks < campaign.minDonationKopecks) {
      throw new BadRequestException(
        `Минимальная сумма пожертвования — ${campaign.minDonationKopecks / 100n} ₽`,
      );
    }

    const isAnonymous = dto.isAnonymous ?? true;
    const region = await this.resolveRegion(dto);
    const contact = this.buildContact(dto, consentIp);

    // Донат и его ПДн пишутся одной транзакцией; внешний вызов провайдера
    // за её границами — держать транзакцию открытой на время сетевого
    // запроса нельзя, это блокировка строки на чужом таймауте.
    const donation = await this.prisma.donation.create({
      data: {
        campaignId: campaign.id,
        regionId: region.regionId,
        regionSource: region.regionSource,
        amountKopecks,
        provider: this.provider.code,
        isAnonymous,
        // Анонимный донат не хранит публичную подпись вообще — это CHECK
        // `donation_anonymous_has_no_public_name`: чего в таблице нет,
        // то невозможно показать по ошибке.
        donorName: isAnonymous ? null : (dto.donorName ?? null),
        ...(contact === null ? {} : { contact: { create: contact } }),
      },
      select: { id: true, invoiceNo: true },
    });

    const payment = await this.provider.createPayment({
      invoiceNo: donation.invoiceNo,
      donationId: donation.id,
      amountKopecks,
      description: `Пожертвование: ${campaign.title}`,
    });

    await this.prisma.donation.update({
      where: { id: donation.id },
      data: { providerPaymentId: payment.externalId },
    });

    return { orderId: donation.id, redirectUrl: payment.redirectUrl };
  }

  /**
   * Статус заказа для страницы «спасибо»: она опрашивает его 3 с × 10,
   * потому что редирект пользователя почти всегда обгоняет вебхук провайдера.
   *
   * Выборка перечисляет поля поимённо и не трогает `contact`: телефон
   * физически не может утечь в публичный ответ.
   */
  async getStatus(orderId: string): Promise<DonationStatusResponse> {
    const donation = await this.prisma.donation.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        amountKopecks: true,
        paidAmountKopecks: true,
        paidAt: true,
      },
    });

    if (donation === null) {
      throw new NotFoundException('Заказ не найден');
    }

    return {
      orderId: donation.id,
      status: donation.status,
      amountKopecks: donation.amountKopecks.toString(),
      paidAmountKopecks: donation.paidAmountKopecks?.toString() ?? null,
      paidAt: donation.paidAt?.toISOString() ?? null,
    };
  }

  /**
   * Регион по слагу. Не найден или выключен — донат всё равно проходит
   * с `region_id = null`: платёж важнее статистики (CLAUDE.md).
   * Регион и источник атрибуции пишутся только вместе — это CHECK
   * `donation_region_source_consistency`.
   */
  private async resolveRegion(dto: CreateDonationDto): Promise<ResolvedRegion> {
    if (dto.regionSlug === undefined) {
      return { regionId: null, regionSource: null };
    }

    const region = await this.prisma.region.findFirst({
      where: { slug: dto.regionSlug, isActive: true },
      select: { id: true },
    });

    if (region === null) {
      return { regionId: null, regionSource: null };
    }

    return {
      regionId: region.id,
      regionSource: dto.regionSource ?? DEFAULT_REGION_SOURCE,
    };
  }

  /**
   * ПДн записываются только при явном согласии. Присланные без согласия
   * телефон или имя — это не повод их «на всякий случай» сохранить
   * и не повод молча выбросить: запрос отклоняется, чтобы расхождение
   * увидели на фронте, а не через полгода при проверке.
   */
  private buildContact(
    dto: CreateDonationDto,
    consentIp?: string,
  ): { phoneE164?: string; fullName?: string; personalDataConsentAt: Date; consentIp?: string } | null {
    const hasPersonalData = dto.phone !== undefined || dto.fullName !== undefined;

    if (!hasPersonalData) {
      return null;
    }

    if (dto.personalDataConsent !== true) {
      throw new BadRequestException(
        'Телефон и имя принимаются только с согласием на обработку персональных данных',
      );
    }

    return {
      phoneE164: dto.phone,
      fullName: dto.fullName,
      personalDataConsentAt: new Date(),
      consentIp,
    };
  }
}
