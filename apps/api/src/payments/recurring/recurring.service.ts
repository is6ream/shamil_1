import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import type { AppConfig } from '../../config/configuration';
import { MAX_DONATION_KOPECKS, MIN_DONATION_KOPECKS } from '../../config/constants';
import { PrismaService } from '../../database/prisma.service';
import type { Donation, Prisma, RecurringSubscription } from '../../generated/prisma/client';
import { PaymentProviderResolver } from '../payment-provider.resolver';
import { PaymentsService } from '../payments.service';
import { chargeAt, frequencies, localDate, nextDate, periodKey, type Frequency } from './calendar';
import { RECURRING_TERMS_ARCHIVE } from './terms';
import { hasConsentEvidence } from './consent';
import { RECURRING_OPTIONS, type RecurringOptions } from '../../recurring-contract/contract';
import { RECURRING_EVIDENCE_POLICY, RECURRING_TERMS_SOURCE, RECURRING_TRANSPORT, documentedEvidencePolicy, robokassaTransport, type EvidencePolicy, type RecurringTransport, type TermsSource } from './runtime-policy';

const provider = 'robokassa';
const checkInterval = 60_000;
const retryCheck = () => new Date(Date.now() + 5 * checkInterval);
const inflight = ['reserved', 'accepted', 'unknown'];

export function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function approvedUrl(value: string | undefined): value is string {
  return value !== undefined && /^https:\/\/[^\s]+$/.test(value);
}

@Injectable()
export class RecurringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly providers: PaymentProviderResolver,
    private readonly payments: PaymentsService,
    @Optional() @Inject(RECURRING_OPTIONS) private readonly options?: RecurringOptions,
    @Optional() @Inject(RECURRING_TERMS_SOURCE) private readonly archive: TermsSource = RECURRING_TERMS_ARCHIVE,
    @Optional() @Inject(RECURRING_EVIDENCE_POLICY) private readonly evidence: EvidencePolicy = documentedEvidencePolicy,
    @Optional() @Inject(RECURRING_TRANSPORT) private readonly transport: RecurringTransport = robokassaTransport,
  ) {}

  private get payment() { return this.config.get('payment', { infer: true }); }

  private get canReconcile(): boolean {
    return this.payment.provider === provider && !this.payment.isTest &&
      this.payment.paymentUrl === 'https://auth.robokassa.ru/Merchant/Index.aspx';
  }

  // Provider policy is independent of checkout and online-order switches.
  private providerSettings() {
    const options = this.options;
    if (!options || !this.canReconcile || this.payment.receipt.enabled || !options.cardLabel || !options.cardMethodCode
      || options.maxKopecks === null || options.maxKopecks <= 0n || options.maxKopecks > BigInt(MAX_DONATION_KOPECKS)) return null;
    return { ...options, cardLabel: options.cardLabel, cardMethodCode: options.cardMethodCode,
      maxKopecks: options.maxKopecks, merchantId: this.payment.merchantId };
  }

  checkoutSettings() {
    const settings = this.providerSettings();
    if (!this.options?.checkoutEnabled || !this.providers.onlineAvailable || !settings?.termsVersion
      || settings.termsVersion === '2026-11-06' // Legacy edition does not authorize email access.
      || !this.archive[settings.termsVersion]
      || !approvedUrl(settings.termsUrl ?? undefined) || !approvedUrl(settings.cancellationUrl ?? undefined)) return null;
    return { ...settings, version: settings.termsVersion, cardLabel: settings.cardLabel, cardMethodCode: settings.cardMethodCode };
  }

  /** Documented request/card-settlement evidence and separately recorded merchant approval. */
  private eligibilityVerified(sub: RecurringSubscription & { firstDonation: Donation }): boolean {
    return this.evidence.verified(sub, this.payment, this.options);
  }

  termsText(version: string): string | null { return this.archive[version]?.join('\n\n') ?? null; }

  private reviewReason(sub: RecurringSubscription & { firstDonation: Donation }): string | null {
    if (sub.merchantId !== this.payment.merchantId || sub.firstDonation.provider !== provider
      || sub.firstDonation.isTestPayment !== false) return 'order_binding_unverified';
    if (!hasConsentEvidence(sub, sub.firstDonation, this.archive)) return 'consent_evidence_missing_or_invalid';
    if (!this.eligibilityVerified(sub)) return 'recurring_eligibility_unverified';
    return null;
  }

  private observe(order: Donation, state: string, reason: string) {
    this.logger.warn(JSON.stringify({ event: 'recurring.reconciliation', orderId: order.id, state, reason,
      ageSeconds: Math.max(0, Math.floor((Date.now() - +order.createdAt) / 1000)) }));
  }

  capabilities() {
    const settings = this.checkoutSettings();
    const today = localDate(new Date());
    return {
      online: this.providers.onlineAvailable,
      recurring: settings && {
        version: settings.version, termsUrl: settings.termsUrl, cancellationUrl: settings.cancellationUrl,
        minKopecks: String(MIN_DONATION_KOPECKS), maxKopecks: settings.maxKopecks.toString(),
        timezone: 'Europe/Moscow', chargeLocalTime: '10:00', requiresVerifiedEmail: true,
        dates: Object.fromEntries(frequencies.map(frequency => [frequency, nextDate(today, frequency, Number(today.slice(-2)))])),
      },
    };
  }

  validatePreview(frequency: Frequency, date: string) {
    const today = localDate(new Date());
    if (date !== nextDate(today, frequency, Number(today.slice(-2)))) {
      throw new BadRequestException('Дата изменилась. Обновите условия и подтвердите согласие снова.');
    }
  }

  async manage(key: string, cancel: boolean) {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new NotFoundException();
    const where = { keyHash: keyHash(key) };
    return this.prisma.$transaction(async tx => {
      if (cancel) {
        // UPDATE takes the same row lock as dispatch. Return only after commit.
        await tx.$queryRaw`SELECT id FROM recurring_subscription WHERE key_hash = ${where.keyHash} FOR UPDATE`;
        await tx.recurringSubscription.updateMany({ where: { ...where, cancelledAt: null },
          data: { state: 'cancelled', nextAt: null, cancelledAt: new Date() } });
        await tx.recurringSubscription.updateMany({ where, data: { state: 'cancelled', nextAt: null } });
      }
      const subscription = await tx.recurringSubscription.findUnique({
        where, include: {
          firstDonation: { select: { status: true, amountKopecks: true } },
          attempts: { orderBy: { period: 'desc' }, take: 1, select: { period: true, state: true } },
        },
      });
      if (!subscription) throw new NotFoundException();
      return {
        amountKopecks: subscription.firstDonation.amountKopecks.toString(), frequency: subscription.frequency,
        termsVersion: subscription.termsVersion, consentedAt: subscription.consentedAt,
        state: subscription.state, nextAt: subscription.nextAt, firstPayment: subscription.firstDonation.status,
        latestAttempt: subscription.attempts[0] ?? null,
      };
    }, { timeout: 12000 });
  }

  onModuleInit() {
    if (this.canReconcile) this.schedule();
  }

  onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.tick();
      } catch {
        this.logger.error('Ошибка обработки регулярных платежей');
      } finally {
        this.schedule();
      }
    }, checkInterval);
    this.timer.unref();
  }

  async tick() {
    if (!this.canReconcile) return;
    const id = this.payment.merchantId;
    await this.prisma.recurringHeartbeat.upsert({ where: { id }, create: { id, lastStartedAt: new Date() }, update: { lastStartedAt: new Date() } });
    await this.runTick();
    await this.prisma.recurringHeartbeat.update({ where: { id }, data: { lastCompletedAt: new Date() } });
  }

  private async runTick() {
    const now = new Date();
    const first = await this.prisma.recurringSubscription.findMany({
      where: { merchantId: this.payment.merchantId, state: { in: ['pending', 'failed', 'cancelled', 'review'] },
        nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' }, take: 20, include: { firstDonation: true },
    });
    for (const subscription of first) await this.reconcileFirst(subscription);
    const attempts = await this.prisma.recurringAttempt.findMany({
      where: { subscription: { merchantId: this.payment.merchantId },
        state: { in: [...inflight, 'failed', 'review'] }, nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' }, take: 20, include: { donation: true },
    });
    for (const attempt of attempts) {
      const state = attempt.donation.status === 'paid'
        ? { kind: 'paid' as const, grossAmountKopecks: attempt.donation.paidAmountKopecks }
        : await this.reconcileOrder(attempt.donation);
      const status = state.kind === 'paid'
        ? ('grossAmountKopecks' in state ? state.grossAmountKopecks === attempt.donation.amountKopecks
          : state.netAmountKopecks === attempt.donation.amountKopecks) ? 'paid' : 'review'
        : state.kind === 'failed' ? 'failed' : state.kind === 'pending' ? 'accepted' : 'unknown';
      if (['reserved', 'unknown', 'review'].includes(attempt.state) || status === 'review' || status === 'unknown') {
        this.observe(attempt.donation, status, status === 'review' ? 'amount_evidence_requires_reconciliation' : 'provider_outcome_unresolved');
      }
      await this.prisma.recurringAttempt.updateMany({
        where: { donationId: attempt.donationId, state: attempt.state },
        data: { state: status, nextCheckAt: retryCheck(), lastReconciledAt: new Date(),
          reconciliationReason: status === 'review' ? 'amount_evidence_requires_reconciliation' : status === 'unknown' ? 'provider_outcome_unresolved' : null },
      });
      if (status === 'review') {
        await this.prisma.recurringSubscription.updateMany({
          where: { id: attempt.subscriptionId, state: 'active' }, data: { state: 'review', nextAt: null },
        });
      }
    }
    if (!this.options?.dispatchEnabled) return;
    const due = await this.prisma.recurringSubscription.findMany({
      where: { merchantId: this.payment.merchantId, state: 'active', nextAt: { lte: now }, nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: 'asc' }, take: 20, select: { id: true },
    });
    for (const { id } of due) {
      const reserved = await this.reserve(id);
      if (reserved) await this.dispatch(id, reserved);
    }
  }

  private async reconcileOrder(order: Donation) {
    if (order.provider !== provider || order.isTestPayment !== false) return { kind: 'unknown' as const };
    const state = await this.transport.query(this.payment, order.invoiceNo);
    // TLS query binds merchant + invoice; echoed Shp must bind the same Donation.
    if (state.kind === 'paid' && (state.orderId !== order.id || state.currency !== 'RUB')) {
      this.observe(order, 'unknown', 'xml_order_or_currency_binding_unverified');
      return { kind: 'unknown' as const };
    }
    // OutSum is merchant credit, NOT automatically gross. Never reverse-divide a fee tariff.
    // Equality is the contract's narrow XML recovery path; ambiguous net remains review.
    if (state.kind === 'failed' || (state.kind === 'paid' && state.netAmountKopecks === order.amountKopecks)) {
      await this.payments.applyWebhook({
        provider, invoiceNo: order.invoiceNo,
        providerEventId: state.kind === 'paid' ? String(order.invoiceNo) : 'state:failed:' + order.invoiceNo,
        status: state.kind, amountKopecks: order.amountKopecks, acknowledgement: '',
      }, { source: 'OpStateExt', Shp_order_id: order.id }, false);
    }
    return state;
  }

  private async reconcileFirst(subscription: RecurringSubscription & { firstDonation: Donation }) {
    const { firstDonation: order, id } = subscription;
    const state = await this.reconcileOrder(order);
    const where = { id, state: subscription.state };
    await this.prisma.recurringSubscription.updateMany({ where, data: { nextCheckAt: retryCheck(), lastReconciledAt: new Date(),
      reconciliationReason: state.kind === 'unknown' ? 'provider_outcome_unresolved' : null } });
    if (subscription.state === 'cancelled') return;
    if (order.status === 'paid' && order.paidAmountKopecks !== order.amountKopecks) {
      this.observe(order, 'review', 'signed_gross_amount_mismatch');
      await this.prisma.recurringSubscription.updateMany({ where, data: { state: 'review', nextAt: null } });
      return;
    }
    if (state.kind === 'failed' && order.status !== 'paid' && ['pending', 'failed'].includes(subscription.state)) {
      await this.prisma.recurringSubscription.updateMany({
        where,
        data: { state: 'failed' },
      });
    }
    if (state.kind !== 'paid') return;
    const settled = await this.prisma.donation.findUniqueOrThrow({ where: { id: order.id } });
    if (!subscription.settlementEvidence && state.method === this.options?.cardMethodCode && settled.status === 'paid'
      && settled.paidAmountKopecks === order.amountKopecks) {
      const evidence = JSON.stringify({ source: 'OpStateExt', method: state.method, orderId: order.id,
        invoiceNo: order.invoiceNo, currency: state.currency, observedAt: new Date().toISOString() });
      await this.prisma.recurringSubscription.updateMany({ where: { id, settlementEvidence: null }, data: { settlementEvidence: evidence } });
      subscription = await this.prisma.recurringSubscription.findUniqueOrThrow({ where: { id }, include: { firstDonation: true } });
    }
    const reason = settled.status !== 'paid' || settled.paidAmountKopecks !== order.amountKopecks
      ? 'gross_amount_unproven_or_mismatched'
      : state.method !== this.options?.cardMethodCode ? 'first_card_method_unverified'
      : this.reviewReason({ ...subscription, firstDonation: settled });
    if (reason) {
      this.observe(order, 'review', reason);
      await this.prisma.recurringSubscription.updateMany({ where, data: { state: 'review', nextAt: null, reconciliationReason: reason } });
      return;
    }
    // Review never silently resumes. Failed -> late success can complete initial activation.
    if (!['pending', 'failed'].includes(subscription.state)) return;
    const firstDate = localDate(state.confirmedAt);
    const today = localDate(new Date());
    const anchorDay = Number(firstDate.slice(-2));
    const frequency = subscription.frequency as Frequency;
    let next = nextDate(firstDate, frequency, anchorDay);
    while (next <= today || next < subscription.previewDate) next = nextDate(next, frequency, anchorDay);
    await this.prisma.recurringSubscription.updateMany({
      where, data: { state: 'active', anchorDay, nextAt: chargeAt(next), nextCheckAt: new Date() },
    });
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM recurring_subscription WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.recurringSubscription.findUniqueOrThrow({ where: { id }, include: { firstDonation: true } });
  }

  /** Query exactly one existing invoice. Never reserves, dispatches or replaces it. */
  async reconcileInvoice(orderId: string) {
    const order = await this.prisma.donation.findUnique({ where: { id: orderId } });
    if (!order || order.provider !== provider) throw new NotFoundException();
    if (!this.canReconcile) throw new BadRequestException('Сверка провайдера недоступна');
    const sub = await this.prisma.recurringSubscription.findUnique({ where: { firstDonationId: orderId }, include: { firstDonation: true } });
    if (sub) await this.reconcileFirst(sub);
    else {
      const attempt = await this.prisma.recurringAttempt.findUnique({ where: { donationId: orderId } });
      if (!attempt) throw new NotFoundException();
      await this.reconcileOrder(order);
      // Main scheduler resolves attempt state; durable immediate request remains inspectable.
      await this.prisma.recurringAttempt.update({ where: { donationId: orderId }, data: {
        nextCheckAt: new Date(), lastReconciledAt: new Date(), reconciliationReason: 'operator_requested_same_invoice',
      } });
    }
    return { orderId, status: (await this.prisma.donation.findUniqueOrThrow({ where: { id: orderId } })).status };
  }

  private async reserve(id: string) {
    return this.prisma.$transaction(async tx => {
      const sub = await this.lock(tx, id);
      const now = new Date();
      if (sub.state !== 'active' || !sub.nextAt || sub.nextAt > now || sub.anchorDay === null) return null;
      if (!this.options?.dispatchEnabled) return null;
      const settings = this.providerSettings();
      const reason = this.reviewReason(sub);
      if (reason || !settings || sub.firstDonation.status !== 'paid'
        || sub.firstDonation.paidAmountKopecks !== sub.firstDonation.amountKopecks
        || sub.firstDonation.amountKopecks > settings.maxKopecks) {
        this.observe(sub.firstDonation, 'review', reason ?? 'provider_policy_or_first_settlement_invalid');
        await tx.recurringSubscription.update({ where: { id }, data: { state: 'review', nextAt: null } });
        return null;
      }
      const unresolved = await tx.recurringAttempt.findFirst({
        where: { subscriptionId: id, state: { in: [...inflight, 'review'] } }, select: { state: true },
      });
      if (unresolved) {
        await tx.recurringSubscription.update({ where: { id }, data: { nextCheckAt: retryCheck() } });
        return null;
      }
      const today = localDate(now);
      const date = localDate(sub.nextAt);
      if (date === today && now < chargeAt(today)) return null;
      const frequency = sub.frequency as Frequency;
      let next = nextDate(date, frequency, sub.anchorDay);
      while (next < today) next = nextDate(next, frequency, sub.anchorDay);
      await tx.recurringSubscription.update({ where: { id }, data: { nextAt: chargeAt(next) } });
      if (date !== today) return null;
      const { campaignId, regionId, regionSource, donorName, isAnonymous, amountKopecks } = sub.firstDonation;
      return tx.recurringAttempt.create({
        data: { subscription: { connect: { id } }, period: periodKey(date, frequency), scheduledAt: sub.nextAt, nextCheckAt: retryCheck(),
          donation: { create: {
            campaignId, regionId, regionSource, donorName, isAnonymous, amountKopecks, provider, isTestPayment: false,
          } } },
        include: { donation: true },
      });
    });
  }

  private async dispatch(id: string, reserved: { donation: Donation; scheduledAt: Date }) {
    await this.prisma.$transaction(async tx => {
      const sub = await this.lock(tx, id);
      const where = { subscriptionId: id, donationId: reserved.donation.id, state: 'reserved' };
      const attempt = await tx.recurringAttempt.findFirst({ where, include: { donation: true } });
      if (!attempt) return;
      const settings = this.providerSettings();
      const allowed = this.options?.dispatchEnabled && !this.reviewReason(sub) && sub.firstDonation.status === 'paid'
        && sub.firstDonation.paidAmountKopecks === sub.firstDonation.amountKopecks
        && settings && sub.firstDonation.amountKopecks <= settings.maxKopecks && sub.state === 'active' &&
        settings.merchantId === sub.merchantId &&
        attempt.donation.provider === provider && attempt.donation.isTestPayment === false &&
        attempt.donation.amountKopecks === sub.firstDonation.amountKopecks &&
        new Date() >= chargeAt(localDate(attempt.scheduledAt)) &&
        localDate(new Date()) === localDate(attempt.scheduledAt);
      const state = allowed
        ? await this.transport.send(this.payment, attempt.donation, sub.firstDonation.invoiceNo) : 'skipped';
      await tx.recurringAttempt.updateMany({ where, data: { state, nextCheckAt: retryCheck(),
        reconciliationReason: state === 'unknown' ? 'dispatch_outcome_unknown' : state === 'skipped' ? 'dispatch_no_longer_allowed' : null,
        lastReconciledAt: new Date() } });
    }, { timeout: 12000 });
  }
}
