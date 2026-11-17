import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AttributionService } from '../attribution/attribution.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import { donorError } from '../donor-auth/donor-auth.errors';
import { PaymentProviderResolver } from '../payments/payment-provider.resolver';
import { RecurringService } from '../payments/recurring/recurring.service';
import type { RecurringCheckoutDto } from '../recurring-contract/dto';
import type { VerifiedDonorIdentity } from '../recurring-contract/contract';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

@Injectable()
export class RecurringCheckoutService {
  constructor(private readonly prisma: PrismaService, private readonly recurring: RecurringService,
    private readonly providers: PaymentProviderResolver, private readonly attribution: AttributionService) {}

  async capabilities() {
    const result = this.recurring.capabilities();
    if (result.recurring) {
      const campaign = await this.prisma.campaign.findFirst({ where: { slug: CAMPAIGN_SLUG, isActive: true } });
      if (!campaign || campaign.minDonationKopecks > BigInt(result.recurring.maxKopecks)) return { ...result, recurring: null };
      return { ...result, recurring: { ...result.recurring, minKopecks: campaign.minDonationKopecks.toString() } };
    }
    return result;
  }

  async checkout(owner: VerifiedDonorIdentity, key: string, dto: RecurringCheckoutDto) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw donorError(400, 'VALIDATION_ERROR', 'Нужен UUID Idempotency-Key');
    }
    const settings = this.recurring.checkoutSettings();
    if (!settings) throw donorError(503, 'RECURRING_UNAVAILABLE', 'Оформление автоплатежа недоступно');
    const anonymous = dto.isAnonymous ?? true;
    const hash = createHash('sha256').update(JSON.stringify({ amountKopecks: String(dto.amountKopecks),
      frequency: dto.frequency, method: dto.method, version: dto.version, previewDate: dto.previewDate,
      isAnonymous: anonymous, donorName: anonymous ? null : dto.donorName ?? null,
      attribution: canonical(dto.attribution ?? null),
    })).digest('hex');
    // Serialize the same owner/key before lookup; unique constraint is a second guard.
    // Robokassa createPayment only signs a URL locally: no external HTTP in this transaction.
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner.donorId + ':' + key.toLowerCase()}, 0))::text`;
      const existing = await tx.recurringSubscription.findUnique({ where: { ownerId_checkoutKey: { ownerId: owner.donorId, checkoutKey: key } } });
      if (existing) {
        if (existing.checkoutRequestHash !== hash) throw donorError(409, 'IDEMPOTENCY_CONFLICT', 'Ключ уже использован с другими условиями');
        if (!existing.checkoutUrl) throw donorError(503, 'SERVICE_UNAVAILABLE', 'Проверьте состояние заказа');
        return { replay: true, subscriptionId: existing.id, orderId: existing.firstDonationId, redirectUrl: existing.checkoutUrl };
      }
      const campaign = await tx.campaign.findFirst({ where: { slug: CAMPAIGN_SLUG, isActive: true } });
      if (!campaign) throw donorError(404, 'NOT_FOUND', 'Активный сбор не найден');
      const amount = BigInt(dto.amountKopecks);
      if (amount < campaign.minDonationKopecks || amount > settings.maxKopecks || dto.method !== 'card' || dto.accepted !== true) {
        throw donorError(400, 'VALIDATION_ERROR', 'Проверьте сумму и согласие');
      }
      if (dto.version !== settings.version) throw donorError(400, 'CONSENT_STALE', 'Условия изменились. Подтвердите согласие снова');
      try { this.recurring.validatePreview(dto.frequency, dto.previewDate); }
      catch { throw donorError(400, 'CONSENT_STALE', 'Дата изменилась. Подтвердите согласие снова'); }
      const text = this.recurring.termsText(settings.version);
      if (!text) throw donorError(503, 'RECURRING_UNAVAILABLE', 'Условия недоступны');
      const now = new Date();
      const order = await tx.donation.create({ data: { campaignId: campaign.id, provider: 'robokassa',
        isTestPayment: false, amountKopecks: amount, isAnonymous: anonymous,
        donorName: anonymous ? null : dto.donorName ?? null, ...this.attribution.resolve({ attribution: dto.attribution }),
      } });
      const provider = this.providers.forChannel('online');
      if (provider.code !== 'robokassa') throw donorError(503, 'RECURRING_UNAVAILABLE', 'Карточная оплата недоступна');
      const payment = await provider.createPayment({ donationId: order.id, invoiceNo: order.invoiceNo,
        amountKopecks: amount, description: `Пожертвование: ${campaign.title}`, recurringCardLabel: settings.cardLabel });
      await tx.donation.update({ where: { id: order.id }, data: { providerPaymentId: payment.externalId } });
      const sub = await tx.recurringSubscription.create({ data: { ownerId: owner.donorId, checkoutKey: key,
        checkoutRequestHash: hash, checkoutUrl: payment.redirectUrl, firstDonationId: order.id,
        merchantId: settings.merchantId, frequency: dto.frequency, previewDate: dto.previewDate,
        consentedAt: now, consentVerifiedAt: now, termsVersion: settings.version,
        termsSnapshot: JSON.stringify({ version: settings.version, text, amountKopecks: amount.toString(), frequency: dto.frequency, previewDate: dto.previewDate }),
        providerEvidence: JSON.stringify({ recurring: true, merchantId: settings.merchantId, mode: 'live', currency: 'RUB',
          orderId: order.id, invoiceNo: order.invoiceNo, cardLabel: settings.cardLabel,
          cardMethodCode: settings.cardMethodCode, approvalReference: settings.approvalReference ?? null }),
      } });
      return { replay: false, subscriptionId: sub.id, orderId: order.id, redirectUrl: payment.redirectUrl };
    }, { timeout: 12000 });
  }
}
