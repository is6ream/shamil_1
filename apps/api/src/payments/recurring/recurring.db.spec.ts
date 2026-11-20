import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ConversionEnqueueService } from '../../metrika/conversion-enqueue.service';
import { AuditService } from '../../audit/audit.service';
import { AttributionService } from '../../attribution/attribution.service';
import type { AppConfig } from '../../config/configuration';
import { PaymentHashAlgorithm } from '../../config/env.validation';
import type { PrismaService } from '../../database/prisma.service';
import { CAMPAIGN_SLUG } from '../../database/seed/campaign.data';
import { createTestPrismaService, describeDatabase, resetDatabase, seedFixtures } from '../../database/testing/test-database';
import { RecurringCheckoutService } from '../../donations/recurring-checkout.service';
import type { RecurringCheckoutDto } from '../../recurring-contract/dto';
import { RegionsService } from '../../showcase/regions.service';
import { PaymentCallbacksController } from '../payment-callbacks.controller';
import { PaymentProviderResolver } from '../payment-provider.resolver';
import { PaymentsService } from '../payments.service';
import { RobokassaProvider } from '../providers/robokassa.provider';
import { hashSignature } from '../robokassa/signature';
import { chargeAt, localDate, nextDate, type Frequency } from './calendar';
import { RECURRING_TERMS_VERSION, RECURRING_TERMS_SNAPSHOT } from './terms';
import { keyHash, RecurringService } from './recurring.service';
import type { RecurringOptions } from '../../recurring-contract/contract';
import { queryRecurring, sendRecurring } from './robokassa-recurring';

jest.mock('./robokassa-recurring');
// Real local PostgreSQL + bcrypt fixtures can exceed Jest's 5s hook default on Windows.
jest.setTimeout(30000);

describeDatabase('recurring persistence with mocked Robokassa', () => {
  let prisma: PrismaService;
  let worker: RecurringService;
  let payments: PaymentsService;
  let campaignId: string;
  let regionId: string;
  const key = 'ab'.repeat(32);
  let options: RecurringOptions;
  function syntheticEligibility(worker: RecurringService) {
    // Test-only stand-in for the evidence port missing from CONTRACT v1. Never enabled in runtime.
    jest.spyOn(worker as unknown as { eligibilityVerified(): boolean }, 'eligibilityVerified').mockReturnValue(true);
    return worker;
  }
  function emailCheckoutFixture() {
    // Synthetic approved-terms fixture for the new verified-owner checkout only.
    jest.spyOn(worker, 'checkoutSettings').mockReturnValue({ ...options, version: RECURRING_TERMS_VERSION,
      termsVersion: RECURRING_TERMS_VERSION, merchantId: 'mock-store', maxKopecks: 100000n,
      termsUrl: 'https://example.test/terms', cancellationUrl: 'https://example.test/cancel',
      cardLabel: 'mock-card', cardMethodCode: 'mock-card' });
  }

  const config = new ConfigService<AppConfig, true>({
    metrika: { offlineGoal: 'donation_paid' },
    publicUrls: { siteUrl: 'http://localhost:3999' },
    payment: {
      provider: 'robokassa', merchantId: 'mock-store', isTest: false, receipt: { enabled: false },
      paymentUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
      secretKey: 'synthetic-init', webhookSecret: 'synthetic-result', hashAlgorithm: PaymentHashAlgorithm.Md5,
    },
  });
  const provider = new RobokassaProvider(config);
  const providers = new PaymentProviderResolver({ online: provider, manual: provider, defaultChannel: 'online' });

  function newWorker(client = prisma) {
    return syntheticEligibility(new RecurringService(client, config, providers, payments, options));
  }

  function setClock(date: string) {
    jest.useFakeTimers({
      now: new Date(date),
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'performance', 'hrtime'],
    });
  }

  async function totals() {
    const stats = await prisma.campaignStats.findUniqueOrThrow({ where: { campaignId } });
    return [stats.paidTotalKopecks, stats.paidCount];
  }

  function resultBody(order: { invoiceNo: number; id: string }, signature?: string) {
    return {
      OutSum: '100.00', InvId: String(order.invoiceNo), Shp_order_id: order.id,
      SignatureValue: signature ?? hashSignature(
        `100.00:${order.invoiceNo}:synthetic-result:Shp_order_id=${order.id}`, PaymentHashAlgorithm.Md5,
      ),
    };
  }

  beforeAll(() => {
    prisma = createTestPrismaService();
    payments = new PaymentsService(prisma, new AuditService(prisma), new ConversionEnqueueService(config));

  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    options = { checkoutEnabled: false, dispatchEnabled: true, termsVersion: null, termsUrl: null,
      cancellationUrl: null, cardLabel: 'mock-card', cardMethodCode: 'mock-card', maxKopecks: 100000n };
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'unknown' });
    await resetDatabase(prisma);
    ({ campaignId, bashkortostanId: regionId } = await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG }));
    worker = newWorker();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(() => jest.useRealTimers());

  async function subscription(state: 'pending' | 'active', frequency: Frequency = 'daily', due = new Date(), anchorDay = 1) {
    const owner = await prisma.donorIdentity.create({ data: { emailNormalized: 'fixture@example.test', emailVerifiedAt: new Date() } });
    const sub = await prisma.recurringSubscription.create({
      data: {
        owner: { connect: { id: owner.id } }, consentedAt: new Date(), consentVerifiedAt: new Date(),
        termsSnapshot: JSON.stringify({ version: RECURRING_TERMS_VERSION, text: RECURRING_TERMS_SNAPSHOT,
          amountKopecks: '10000', frequency, previewDate: localDate(new Date()) }),
        keyHash: keyHash(key), merchantId: 'mock-store', frequency, termsVersion: RECURRING_TERMS_VERSION, state,
        previewDate: localDate(new Date()), anchorDay: state === 'active' ? anchorDay : null,
        nextAt: state === 'active' ? due : null, nextCheckAt: new Date(),
        firstDonation: { create: {
          campaignId, amountKopecks: 10000n, provider: 'robokassa', regionId, regionSource: 'form', isTestPayment: false,
        } },
      },
      include: { firstDonation: true },
    });
    if (state === 'active') {
      await new PaymentCallbacksController(payments, providers).handleRobokassaResult(resultBody(sub.firstDonation));
    }
    return sub;
  }

  it('activates the settled first payment and persists the next date with dispatch off', async () => {
    setClock('2027-01-31T08:00:00Z');
    Object.assign(options, { dispatchEnabled: false });
    const sub = await subscription('pending', 'monthly');
    const callback = new PaymentCallbacksController(payments, providers);
    await callback.handleRobokassaResult(resultBody(sub.firstDonation));
    expect(await worker.manage(key, false)).toMatchObject({ state: 'pending', firstPayment: 'paid', nextAt: null });
    expect(await totals()).toEqual([10000n, 1]);
    jest.mocked(queryRecurring).mockResolvedValue({
      kind: 'paid', netAmountKopecks: 10000n, currency: 'RUB', orderId: sub.firstDonationId, method: 'mock-card', confirmedAt: new Date(),
    });
    await worker.tick();
    expect(await worker.manage(key, false)).toMatchObject({
      state: 'active', firstPayment: 'paid', nextAt: new Date('2027-02-28T07:00:00Z'),
    });
    expect(await prisma.recurringAttempt.count({ where: { subscriptionId: sub.id } })).toBe(0);
    expect(sendRecurring).not.toHaveBeenCalled();
    expect(await prisma.paymentEvent.count({ where: { donationId: sub.firstDonationId } })).toBe(1);
  });

  it('records a declined first invoice without activating', async () => {
    await subscription('pending');
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'failed' });
    await worker.tick();
    expect(await worker.manage(key, false)).toMatchObject({ state: 'failed', firstPayment: 'failed' });
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('recovers a failed first invoice by XML and deduplicates the later ResultURL', async () => {
    const sub = await subscription('pending');
    Object.assign(options, { checkoutEnabled: false, dispatchEnabled: false });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'failed' });
    await worker.tick();
    await prisma.recurringSubscription.update({ where: { id: sub.id }, data: { nextCheckAt: new Date(0) } });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks: 10000n,
      currency: 'RUB', orderId: sub.firstDonationId, method: 'mock-card', confirmedAt: new Date() });
    await worker.tick();
    await new PaymentCallbacksController(payments, providers).handleRobokassaResult(resultBody(sub.firstDonation));
    expect(await totals()).toEqual([10000n, 1]);
    expect(await prisma.paymentEvent.count({ where: { donationId: sub.firstDonationId, status: 'paid' } })).toBe(1);
    expect(await worker.manage(key, false)).toMatchObject({ state: 'active', firstPayment: 'paid' });
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('recovers a failed child after cancellation by XML without repeating a charge', async () => {
    setClock('2026-11-06T07:00:00Z');
    const sub = await subscription('active');
    jest.mocked(sendRecurring).mockResolvedValue('unknown');
    await worker.tick();
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({ include: { donation: true } });
    await worker.manage(key, true);
    Object.assign(options, { checkoutEnabled: false, dispatchEnabled: false });
    await prisma.recurringAttempt.update({ where: { donationId: attempt.donationId }, data: { nextCheckAt: new Date(0) } });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'failed' });
    await worker.tick();
    await prisma.recurringAttempt.update({ where: { donationId: attempt.donationId }, data: { nextCheckAt: new Date(0) } });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks: 10000n,
      currency: 'RUB', orderId: attempt.donationId, method: 'mock-card', confirmedAt: new Date() });
    await worker.tick();
    await new PaymentCallbacksController(payments, providers).handleRobokassaResult(resultBody(attempt.donation));
    expect(await totals()).toEqual([20000n, 2]);
    expect(await prisma.paymentEvent.count({ where: { donationId: attempt.donationId, status: 'paid' } })).toBe(1);
    expect(await prisma.recurringAttempt.findUniqueOrThrow({ where: { donationId: attempt.donationId } })).toMatchObject({ state: 'paid' });
    expect(await prisma.recurringSubscription.findUniqueOrThrow({ where: { id: sub.id } })).toMatchObject({ state: 'cancelled', nextAt: null });
    expect(sendRecurring).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong payment method', 10000n, 'other-method'],
    ['mismatched amount', 9900n, 'mock-card'],
  ])('requires review after %s on the first invoice', async (_label, amount, method) => {
    const sub = await subscription('pending');
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks: amount, currency: 'RUB', orderId: sub.firstDonationId, method, confirmedAt: new Date() });
    await worker.tick();
    expect(await worker.manage(key, false)).toMatchObject({ state: 'review', nextAt: null });
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('reuses the first invoice and rejects a forged callback before touching the database', async () => {
    emailCheckoutFixture();
    const donations = new RecurringCheckoutService(prisma, worker, providers, new AttributionService(config));
    const owner = await prisma.donorIdentity.create({ data: { emailNormalized: 'checkout@example.test', emailVerifiedAt: new Date() } });
    const principal = { donorId: owner.id, sessionId: randomUUID(), emailVerifiedAt: owner.emailVerifiedAt };
    const callback = new PaymentCallbacksController(payments, providers);
    const today = localDate(new Date());
    const dto: RecurringCheckoutDto = {
      amountKopecks: 10000, frequency: 'daily', version: RECURRING_TERMS_VERSION, previewDate: nextDate(today, 'daily', 1),
      method: 'card', accepted: true,
    };
    const checkoutKey = randomUUID();
    const [first, replay] = await Promise.all([donations.checkout(principal, checkoutKey, dto), donations.checkout(principal, checkoutKey, dto)]);
    expect(replay.orderId).toBe(first.orderId);
    expect(await prisma.donation.count()).toBe(1);
    expect(await prisma.recurringSubscription.count()).toBe(1);
    const order = await prisma.donation.findUniqueOrThrow({ where: { id: first.orderId } });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'unknown' });
    await expect(callback.handleRobokassaResult(resultBody(order, 'forged'))).rejects.toMatchObject({ status: 401 });
    await worker.tick();
    expect(await prisma.recurringSubscription.findUniqueOrThrow({ where: { id: first.subscriptionId } })).toMatchObject({ state: 'pending' });
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await totals()).toEqual([0n, 0]);
  });

  it.each([
    ['daily', '2027-01-31', 1, '2027-01-31', '2027-02-01'],
    ['every_friday', '2026-11-06', 1, '2026-11-06', '2026-11-13'],
    ['monthly', '2027-02-28', 31, '2027-02', '2027-03-31'],
  ] as const)('dispatches %s on its scheduled day', async (frequency, date, anchor, period, next) => {
    const due = chargeAt(date);
    setClock(due.toISOString());
    const sub = await subscription('active', frequency, due, anchor);
    jest.mocked(sendRecurring).mockResolvedValue('accepted');
    await worker.tick();
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({ include: { donation: true } });
    expect(attempt).toMatchObject({ period, scheduledAt: due, state: 'accepted' });
    expect(sendRecurring).toHaveBeenCalledWith(expect.anything(), attempt.donation, sub.firstDonation.invoiceNo);
    expect(await worker.manage(key, false)).toMatchObject({ nextAt: chargeAt(next) });
    expect(await totals()).toEqual([10000n, 1]);
  });

  it('rejects a duplicate invoice number and duplicate subscription period', async () => {
    setClock('2026-11-06T07:00:00Z');
    const due = new Date();
    const sub = await subscription('active', 'daily', due);
    const period = localDate(due);
    jest.mocked(sendRecurring).mockResolvedValue('accepted');
    await worker.tick();
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({ include: { donation: true } });
    await expect(prisma.donation.create({
      data: { campaignId, invoiceNo: attempt.donation.invoiceNo, amountKopecks: 10000n, provider: 'robokassa' },
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.recurringAttempt.create({
      data: { subscription: { connect: { id: sub.id } }, period, scheduledAt: due, donation: {
        create: { campaignId, amountKopecks: 10000n, provider: 'robokassa' },
      } },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('skips a missed Friday on Saturday', async () => {
    setClock('2026-11-07T10:00:00Z');
    await subscription('active', 'every_friday', chargeAt('2026-11-06'));
    await worker.tick();
    expect(await prisma.recurringAttempt.count()).toBe(0);
    expect(sendRecurring).not.toHaveBeenCalled();
    expect(await worker.manage(key, false)).toMatchObject({ nextAt: chargeAt('2026-11-13') });
  });

  it('keeps the January 31 anchor through February settlement and the March dispatch', async () => {
    setClock('2027-01-31T08:00:00Z');
    const sub = await subscription('pending', 'monthly');
    jest.mocked(queryRecurring).mockResolvedValue({
      kind: 'paid', netAmountKopecks: 10000n, currency: 'RUB', orderId: sub.firstDonationId, method: 'mock-card', confirmedAt: new Date(),
    });
    jest.mocked(sendRecurring).mockResolvedValue('accepted');
    await worker.tick();
    expect(await worker.manage(key, false)).toMatchObject({ nextAt: chargeAt('2027-02-28') });

    jest.setSystemTime(chargeAt('2027-02-28'));
    await worker.tick();
    const february = await prisma.recurringAttempt.findFirstOrThrow({ include: { donation: true } });
    expect(february.period).toBe('2027-02');
    expect(february.donation).toMatchObject({ regionId, regionSource: 'form' });
    const regions = new RegionsService(prisma);
    expect((await regions.getTopRegions()).items).toMatchObject([{ slug: '02', donorsCount: 1 }]);
    const callback = new PaymentCallbacksController(payments, providers);
    await callback.handleRobokassaResult(resultBody(february.donation));
    await callback.handleRobokassaResult(resultBody(february.donation));
    expect(await worker.manage(key, false)).toMatchObject({ nextAt: chargeAt('2027-03-31') });

    jest.setSystemTime(chargeAt('2027-03-31'));
    await worker.tick();
    expect(await prisma.recurringAttempt.count({ where: { subscriptionId: sub.id, period: '2027-03' } })).toBe(1);
    expect(sendRecurring).toHaveBeenCalledTimes(2);
    expect(await totals()).toEqual([20000n, 2]);
    expect((await regions.getTopRegions()).items).toMatchObject([
      { slug: '02', donorsCount: 2, paidTotalKopecks: '20000' },
    ]);
  });

  it('reserves once under concurrent ticks and reconciles the same invoice after restart', async () => {
    setClock('2026-11-06T07:00:00Z');
    const sub = await subscription('active');
    jest.mocked(sendRecurring).mockResolvedValue('unknown');
    const other = createTestPrismaService();
    try {
      await Promise.all([worker.tick(), newWorker(other).tick()]);
    } finally {
      await other.$disconnect();
    }
    expect(sendRecurring).toHaveBeenCalledTimes(1);
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({
      where: { subscriptionId: sub.id }, include: { donation: true },
    });
    setClock(new Date(Date.now() + 86400000).toISOString());
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'unknown' });
    await newWorker().tick();
    expect(queryRecurring).toHaveBeenCalledWith(expect.anything(), attempt.donation.invoiceNo);
    expect(await prisma.recurringAttempt.count()).toBe(1);
    await prisma.recurringAttempt.updateMany({ data: { nextCheckAt: new Date(0) } });
    // Check the original invoice again without dispatching a new period in this tick.
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'failed' });
    await newWorker().tick();
    expect(queryRecurring).toHaveBeenCalledWith(expect.anything(), attempt.donation.invoiceNo);
    expect(await worker.manage(key, false)).toMatchObject({ latestAttempt: { state: 'failed' } });
    expect(sendRecurring).toHaveBeenCalledTimes(1);
  });

  it('reconciles a persisted reservation after a crash before dispatch', async () => {
    setClock('2026-11-06T07:00:00Z');
    const sub = await subscription('active');
    // Interrupt the worker after its reservation transaction has committed.
    jest.spyOn(worker as unknown as { dispatch: () => Promise<void> }, 'dispatch')
      .mockRejectedValueOnce(new Error('worker stopped'));
    await expect(worker.tick()).rejects.toThrow('worker stopped');
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({
      where: { subscriptionId: sub.id }, include: { donation: true },
    });
    expect(attempt.state).toBe('reserved');
    jest.setSystemTime(new Date('2026-11-07T07:00:00Z'));
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'unknown' });
    await newWorker().tick();
    expect(queryRecurring).toHaveBeenCalledWith(expect.anything(), attempt.donation.invoiceNo);
    expect(sendRecurring).not.toHaveBeenCalled();
    expect(await prisma.recurringAttempt.count()).toBe(1);
  });

  it('serializes cancellation with dispatch and keeps a late payment idempotent', async () => {
    setClock('2026-11-06T07:00:00Z');
    await subscription('active');
    await expect(worker.manage('ff'.repeat(32), true)).rejects.toThrow();
    let finish!: () => void;
    let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    jest.mocked(sendRecurring).mockImplementation(() => new Promise(resolve => {
      finish = () => resolve('accepted');
      started();
    }));
    const run = worker.tick();
    await sending;
    const cancel = worker.manage(key, true);
    try {
      let waiting = false;
      for (let probe = 0; probe < 100 && !waiting; probe++) {
        const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query LIKE '%recurring_subscription%' AND query LIKE '%FOR UPDATE%'
          ) AS waiting
        `;
        waiting = row?.waiting === true;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
    } finally {
      finish();
      await run;
    }
    await expect(cancel).resolves.toMatchObject({ state: 'cancelled' });
    const attempt = await prisma.recurringAttempt.findFirstOrThrow({ include: { donation: true } });
    const order = attempt.donation;
    const callback = new PaymentCallbacksController(payments, providers);
    expect(await totals()).toEqual([10000n, 1]);
    await expect(callback.handleRobokassaResult(resultBody(order, 'forged'))).rejects.toMatchObject({ status: 401 });
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(await totals()).toEqual([10000n, 1]);
    await callback.handleRobokassaResult(resultBody(order));
    await callback.handleRobokassaResult(resultBody(order));
    expect(await prisma.paymentEvent.count({ where: { donationId: order.id } })).toBe(1);
    expect(await totals()).toEqual([20000n, 2]);
    jest.setSystemTime(new Date('2026-11-07T07:00:00Z'));
    await newWorker().tick();
    expect(sendRecurring).toHaveBeenCalledTimes(1);
    expect(await worker.manage(key, false)).toMatchObject({ state: 'cancelled' });
  }, 15000);
  it('stores the complete accepted version and rejects missing consent, stale version and date', async () => {
    emailCheckoutFixture();
    const donations = new RecurringCheckoutService(prisma, worker, providers, new AttributionService(config));
    const owner = await prisma.donorIdentity.create({ data: { emailNormalized: 'checkout@example.test', emailVerifiedAt: new Date() } });
    const principal = { donorId: owner.id, sessionId: randomUUID(), emailVerifiedAt: owner.emailVerifiedAt };
    const today = localDate(new Date());
    const dto: RecurringCheckoutDto = {
      amountKopecks: 10000, frequency: 'daily', version: RECURRING_TERMS_VERSION,
        previewDate: nextDate(today, 'daily', 1), method: 'card', accepted: true,
    };
    for (const changes of [
      { accepted: false }, { accepted: undefined }, { version: 'obsolete' }, { previewDate: '2020-01-01' },
    ]) {
      await expect(donations.checkout(principal, randomUUID(), { ...dto, ...changes } as RecurringCheckoutDto))
        .rejects.toMatchObject({ status: 400 });
    }
    expect(await prisma.recurringSubscription.count()).toBe(0);
    const result = await donations.checkout(principal, randomUUID(), dto);
    const sub = await prisma.recurringSubscription.findUniqueOrThrow({ where: { id: result.subscriptionId }, include: { firstDonation: true } });
    expect(JSON.parse(sub.termsSnapshot ?? '{}')).toEqual({
      version: RECURRING_TERMS_VERSION, text: RECURRING_TERMS_SNAPSHOT,
      amountKopecks: '10000', frequency: 'daily', previewDate: dto.previewDate,
    });
    expect(sub.termsVersion).toBe(RECURRING_TERMS_VERSION);
    expect(sub.frequency).toBe('daily');
    expect(sub.firstDonation.amountKopecks).toBe(10000n);
    expect(sub.consentedAt).toBeInstanceOf(Date);
    await expect(prisma.recurringSubscription.update({ where: { id: sub.id }, data: { termsSnapshot: 'changed' } })).rejects.toThrow();
  });

  it('cancels pending subscriptions repeatedly with registration disabled and never activates a late callback', async () => {
    const sub = await subscription('pending');
    Object.assign(options, { checkoutEnabled: false, dispatchEnabled: false });
    try {
      expect(worker.capabilities().recurring).toBeNull();
      const results = await Promise.all([worker.manage(key, true), newWorker().manage(key, true)]);
      expect(results.every(result => result.state === 'cancelled')).toBe(true);
      const callback = new PaymentCallbacksController(payments, providers);
      await callback.handleRobokassaResult(resultBody(sub.firstDonation));
      jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks: 10000n, currency: 'RUB', orderId: sub.firstDonationId, method: 'mock-card', confirmedAt: new Date() });
      await worker.tick();
      expect(await worker.manage(key, false)).toMatchObject({ state: 'cancelled', nextAt: null, firstPayment: 'paid' });
      expect(sendRecurring).not.toHaveBeenCalled();
      await expect(prisma.recurringSubscription.update({ where: { id: sub.id }, data: { state: 'pending' } })).rejects.toThrow();
      await expect(worker.manage(sub.id, true)).rejects.toThrow();
      await expect(worker.manage('cd'.repeat(32), false)).rejects.toThrow();
    } finally { Object.assign(options, { dispatchEnabled: true }); }
  });

  it('does not send a reserved operation when cancellation wins the lock', async () => {
    setClock('2026-11-06T07:00:00Z');
    await subscription('active');
    const dispatch = (worker as unknown as { dispatch: (...args: unknown[]) => Promise<void> }).dispatch.bind(worker);
    jest.spyOn(worker as unknown as { dispatch: (...args: unknown[]) => Promise<void> }, 'dispatch')
      .mockImplementation(async (...args) => { await newWorker().manage(key, true); await dispatch(...args); });
    await worker.tick();
    expect(sendRecurring).not.toHaveBeenCalled();
    expect(await prisma.recurringAttempt.findFirstOrThrow()).toMatchObject({ state: 'skipped' });
    expect(await worker.manage(key, false)).toMatchObject({ state: 'cancelled' });
  });

});
