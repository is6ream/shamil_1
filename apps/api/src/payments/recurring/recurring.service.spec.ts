import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentHashAlgorithm } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import type { Donation, RecurringSubscription } from '../../generated/prisma/client';
import { RECURRING_OPTIONS, type RecurringOptions } from '../../recurring-contract/contract';
import { PaymentProviderResolver } from '../payment-provider.resolver';
import { PaymentsService } from '../payments.service';
import { hasConsentEvidence } from './consent';
import { RecurringService } from './recurring.service';
import { queryRecurring, sendRecurring } from './robokassa-recurring';
import { RECURRING_TERMS_SNAPSHOT } from './terms';

jest.mock('./robokassa-recurring');

type Subscription = RecurringSubscription & { firstDonation: Donation };
// Private seams exercise safety checks without a real database or network.
type Engine = {
  reconcileFirst(sub: Subscription): Promise<void>;
  reconcileOrder(order: Donation): Promise<unknown>;
  reserve(id: string): Promise<unknown>;
  dispatch(id: string, reserved: { donation: Donation; scheduledAt: Date }): Promise<void>;
  eligibilityVerified(): boolean;
};

describe('recurring engine regressions (injected persistence and transport)', () => {
  let worker: RecurringService;
  let engine: Engine;
  let sub: Subscription;
  let order: Donation;
  let options: RecurringOptions;
  const subscriptions = { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() };
  const attempts = { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() };
  const donation = { findUniqueOrThrow: jest.fn() };
  const raw = jest.fn();
  const applyWebhook = jest.fn();
  const tx = { recurringSubscription: subscriptions, recurringAttempt: attempts, donation, $queryRaw: raw,
    recurringHeartbeat: { upsert: jest.fn(), update: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: new Date('2027-01-31T08:00:00Z') });
    options = { checkoutEnabled: false, dispatchEnabled: false, termsVersion: null, termsUrl: null,
      cancellationUrl: null, cardLabel: 'mock-card', cardMethodCode: 'mock-card', maxKopecks: 100000n };
    order = { id: 'first', invoiceNo: 12, amountKopecks: 10000n, status: 'pending', paidAmountKopecks: null,
      provider: 'robokassa', isTestPayment: false, createdAt: new Date('2027-01-30T08:00:00Z'),
    } as Donation;
    sub = { id: 'subscription', firstDonationId: order.id, firstDonation: order, merchantId: 'mock-store',
      ownerId: 'verified-donor', state: 'pending', frequency: 'monthly', previewDate: '2027-02-28', termsVersion: '2026-11-06',
      consentedAt: new Date('2027-01-30T08:00:00Z'), consentVerifiedAt: new Date('2027-01-30T08:00:00Z'),
      termsSnapshot: JSON.stringify({ version: '2026-11-06', text: RECURRING_TERMS_SNAPSHOT,
        amountKopecks: '10000', frequency: 'monthly', previewDate: '2027-02-28' }),
      nextAt: null, anchorDay: null,
    } as Subscription;
    subscriptions.findMany.mockResolvedValue([]);
    attempts.findMany.mockResolvedValue([]);
    subscriptions.findUniqueOrThrow.mockImplementation(async () => sub);
    donation.findUniqueOrThrow.mockImplementation(async () => order);
    applyWebhook.mockImplementation(async (event: { status: 'paid' | 'failed'; amountKopecks: bigint }) => {
      if (order.status !== 'paid') {
        order.status = event.status;
        order.paidAmountKopecks = event.status === 'paid' ? event.amountKopecks : null;
      }
    });
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'unknown' });
    const module = await Test.createTestingModule({ providers: [RecurringService,
      { provide: PrismaService, useValue: { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } },
      { provide: ConfigService, useValue: { get: () => ({ provider: 'robokassa', merchantId: 'mock-store',
        webhookSecret: 'synthetic-password-2', hashAlgorithm: PaymentHashAlgorithm.Md5,
        isTest: false, paymentUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx', receipt: { enabled: false } }) } },
      { provide: PaymentProviderResolver, useValue: { onlineAvailable: false } },
      { provide: PaymentsService, useValue: { applyWebhook } },
      { provide: RECURRING_OPTIONS, useValue: options },
    ] }).compile();
    worker = module.get(RecurringService);
    engine = worker as unknown as Engine;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function xml(netAmountKopecks = 10000n) {
    jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks, currency: 'RUB',
      orderId: order.id, method: 'mock-card', confirmedAt: new Date() });
  }

  function active() {
    sub.state = 'active'; sub.nextAt = new Date('2027-01-31T07:00:00Z'); sub.anchorDay = 31;
    order.status = 'paid'; order.paidAmountKopecks = 10000n;
  }

  it.each(['pending', 'failed', 'cancelled'])('recovers lost-callback money for a %s first invoice with checkout/dispatch off', async state => {
    sub.state = state; order.status = state === 'failed' ? 'failed' : 'pending'; xml();
    await engine.reconcileFirst(sub);
    expect(applyWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', providerEventId: '12', amountKopecks: 10000n }),
      { source: 'OpStateExt', Shp_order_id: 'first' }, false);
    expect(order.status).toBe('paid');
    expect(subscriptions.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'active' }) }));
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('keeps a net/gross discrepancy in review without posting invented money', async () => {
    xml(9700n);
    await engine.reconcileFirst(sub);
    expect(applyWebhook).not.toHaveBeenCalled();
    expect(order.status).toBe('pending');
    expect(subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'review', nextAt: null }) }));
  });

  it('requires review for a signed gross mismatch even when XML is unavailable', async () => {
    order.status = 'paid'; order.paidAmountKopecks = 9900n;
    await engine.reconcileFirst(sub);
    expect(subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: 'review', nextAt: null } }));
    expect(order.paidAmountKopecks).toBe(9900n);
  });

  it('requires eligibility evidence even with signed gross, card method and complete consent', async () => {
    order.status = 'paid'; order.paidAmountKopecks = 10000n; xml();
    expect(hasConsentEvidence(sub, order)).toBe(true);
    const warn = jest.spyOn(worker['logger'], 'warn').mockImplementation(() => undefined);
    await engine.reconcileFirst(sub);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('recurring_eligibility_unverified'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ageSeconds":86400'));
    warn.mockRestore();
  });

  it.each([null, '', '{}', '{', JSON.stringify({ version: '2026-11-06' })])('rejects absent or incomplete historical snapshot %s', snapshot => {
    sub.termsSnapshot = snapshot;
    expect(hasConsentEvidence(sub, order)).toBe(false);
  });

  it.each(['text', 'amountKopecks', 'frequency', 'previewDate', 'version'])('rejects a changed consent %s', field => {
    const snapshot = JSON.parse(sub.termsSnapshot ?? '{}') as Record<string, unknown>;
    snapshot[field] = 'changed'; sub.termsSnapshot = JSON.stringify(snapshot);
    expect(hasConsentEvidence(sub, order)).toBe(false);
  });

  it('does not treat claim or an email owner as verified consent', () => {
    sub.consentVerifiedAt = null; sub.ownerId = 'donor'; sub.legacyClaimedAt = new Date();
    expect(hasConsentEvidence(sub, order)).toBe(false);
  });

  it('preserves the monthly anchor on late initial activation once external eligibility dependency is supplied', async () => {
    // Synthetic proof only; production deliberately has no bypass in CONTRACT v1.
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    sub.state = 'failed'; order.status = 'failed'; xml();
    await engine.reconcileFirst(sub);
    expect(subscriptions.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: sub.id, state: 'failed' },
      data: expect.objectContaining({ state: 'active', anchorDay: 31, nextAt: new Date('2027-02-28T07:00:00Z') }) }));
  });

  it('cannot reactivate cancellation even with synthetic eligibility evidence', async () => {
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    sub.state = 'cancelled'; xml(); await engine.reconcileFirst(sub);
    expect(subscriptions.updateMany).toHaveBeenCalledTimes(1);
    expect(subscriptions.updateMany).toHaveBeenCalledWith({ where: { id: sub.id, state: 'cancelled' }, data: expect.objectContaining({ nextCheckAt: expect.any(Date) }) });
  });

  it('binds XML to currency and order before posting money', async () => {
    xml(); jest.mocked(queryRecurring).mockResolvedValue({ kind: 'paid', netAmountKopecks: 10000n,
      currency: 'RUB', orderId: 'other', method: 'mock-card', confirmedAt: new Date() });
    await expect(engine.reconcileOrder(order)).resolves.toEqual({ kind: 'unknown' });
    expect(applyWebhook).not.toHaveBeenCalled();
  });

  it.each([true, false])('reconciles a paid first invoice from CDATA with dispatch off (matching UUID: %s)', async matches => {
    const orderId = '11111111-2222-4333-8444-555555555555';
    const echoedId = matches ? orderId : '66666666-7777-4888-8999-000000000000';
    Object.assign(options, { cardLabel: 'BankCard', cardMethodCode: 'BankCard', approvalReference: 'mock-approval' });
    Object.assign(order, { id: orderId, status: 'paid', amountKopecks: 1000n, paidAmountKopecks: 1000n });
    Object.assign(sub, {
      firstDonationId: orderId,
      settlementEvidence: null,
      providerEvidence: JSON.stringify({
        recurring: true, mode: 'live', merchantId: sub.merchantId, orderId, invoiceNo: order.invoiceNo,
        currency: 'RUB', cardLabel: options.cardLabel, cardMethodCode: options.cardMethodCode,
        approvalReference: options.approvalReference,
      }),
      termsSnapshot: JSON.stringify({ version: sub.termsVersion, text: RECURRING_TERMS_SNAPSHOT,
        amountKopecks: '1000', frequency: sub.frequency, previewDate: sub.previewDate }),
    });
    subscriptions.findMany.mockResolvedValue([sub]);
    subscriptions.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(sub, data);
      return { count: 1 };
    });
    jest.mocked(queryRecurring).mockImplementation(
      jest.requireActual<typeof import('./robokassa-recurring')>('./robokassa-recurring').queryRecurring,
    );
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<OperationStateResponse xmlns="http://merchant.roboxchange.com/WebService/">' +
      '<Result><Code>0</Code></Result><State><Code>100</Code><StateDate>2027-01-31T10:50:00+03:00</StateDate></State>' +
      '<Info><PaymentMethod><Code>BankCard</Code></PaymentMethod><OutSum>10.000000</OutSum><OutCurrLabel>BNR</OutCurrLabel></Info>' +
      '<UserFields><Field><Name><![CDATA[Shp_order_id]]></Name><Value><![CDATA[' + echoedId + ']]></Value></Field></UserFields>' +
      '</OperationStateResponse>',
    ));
    const warn = jest.spyOn(worker['logger'], 'warn').mockImplementation(() => undefined);

    await worker.tick();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = fetcher.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toMatch(/\/OpStateExt$/);
    expect(url.searchParams.get('InvoiceID')).toBe(String(order.invoiceNo));
    expect(subscriptions.findMany).toHaveBeenCalledTimes(1);
    expect(attempts.create).not.toHaveBeenCalled();
    expect(sendRecurring).not.toHaveBeenCalled();
    if (matches) {
      expect(sub).toMatchObject({ state: 'active', anchorDay: 31, nextAt: new Date('2027-02-28T07:00:00Z') });
      expect(applyWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', invoiceNo: order.invoiceNo,
        providerEventId: String(order.invoiceNo), amountKopecks: 1000n }), { source: 'OpStateExt', Shp_order_id: orderId }, false);
    } else {
      expect(sub).toMatchObject({ state: 'pending', nextAt: null, settlementEvidence: null,
        reconciliationReason: 'provider_outcome_unresolved' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('xml_order_or_currency_binding_unverified'));
      expect(applyWebhook).not.toHaveBeenCalled();
    }
  });

  it('rejects a test Donation without querying the production XML endpoint', async () => {
    order.isTestPayment = true; await engine.reconcileOrder(order);
    expect(queryRecurring).not.toHaveBeenCalled(); expect(applyWebhook).not.toHaveBeenCalled();
  });

  it('scans failed and review first/child invoices even when both switches are off', async () => {
    await worker.tick();
    expect(subscriptions.findMany).toHaveBeenCalledTimes(1);
    expect(subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: { in: ['pending', 'failed', 'cancelled', 'review'] } }) }));
    expect(attempts.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: { in: ['reserved', 'accepted', 'unknown', 'failed', 'review'] } }) }));
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it.each(['failed', 'unknown', 'reserved', 'review'])('recovers a %s child with a lost callback by XML without resending', async state => {
    xml(); attempts.findMany.mockResolvedValue([{ donation: order, donationId: order.id, subscriptionId: sub.id, state }]);
    await worker.tick();
    expect(order.status).toBe('paid');
    expect(attempts.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'paid' }) }));
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('accepts a late signed child callback after failed without depending on XML availability', async () => {
    order.status = 'paid'; order.paidAmountKopecks = 10000n;
    attempts.findMany.mockResolvedValue([{ donation: order, donationId: order.id, subscriptionId: sub.id, state: 'failed' }]);
    await worker.tick();
    expect(queryRecurring).not.toHaveBeenCalled();
    expect(attempts.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'paid' }) }));
  });

  it('does not reserve when dispatch is disabled, even with an active subscription', async () => {
    active(); await engine.reserve(sub.id); expect(attempts.create).not.toHaveBeenCalled();
    expect(raw).toHaveBeenCalled();
  });

  it('holds unresolved reservations across restarts without blind dispatch', async () => {
    active(); Object.assign(options, { dispatchEnabled: true });
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    attempts.findFirst.mockResolvedValue({ state: 'unknown' });
    await engine.reserve(sub.id);
    expect(attempts.create).not.toHaveBeenCalled(); expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('dispatch is independent of checkout and the online-orders switch after verified policy', async () => {
    active(); Object.assign(options, { dispatchEnabled: true });
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    attempts.findFirst.mockResolvedValue({ donationId: 'child', donation: { ...order, id: 'child' }, scheduledAt: new Date('2027-01-31T07:00:00Z') });
    jest.mocked(sendRecurring).mockResolvedValue('unknown');
    await engine.dispatch(sub.id, { donation: { ...order, id: 'child' }, scheduledAt: new Date('2027-01-31T07:00:00Z') });
    expect(sendRecurring).toHaveBeenCalledTimes(1);
    expect(attempts.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'unknown' }) }));
  });

  it('reconciles the persisted reservation after a send followed by a database failure, without sending again', async () => {
    active(); Object.assign(options, { dispatchEnabled: true });
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    const child: Donation = { ...order, id: 'child', invoiceNo: 13, status: 'pending', paidAmountKopecks: null };
    const persisted = { donationId: child.id, donation: child, subscriptionId: sub.id,
      scheduledAt: new Date('2027-01-31T07:00:00Z'), state: 'reserved' };
    attempts.findFirst.mockResolvedValue(persisted);
    jest.mocked(sendRecurring).mockResolvedValue('unknown');
    attempts.updateMany.mockRejectedValueOnce(new Error('commit lost'));
    await expect(engine.dispatch(sub.id, persisted)).rejects.toThrow('commit lost');
    attempts.findMany.mockResolvedValue([persisted]);
    await worker.tick();
    expect(queryRecurring).toHaveBeenCalledWith(expect.anything(), 13);
    expect(sendRecurring).toHaveBeenCalledTimes(1);
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('rejects a child whose amount differs from the accepted first donation', async () => {
    active(); Object.assign(options, { dispatchEnabled: true });
    jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    const child = { ...order, id: 'child', amountKopecks: 20000n };
    attempts.findFirst.mockResolvedValue({ donationId: child.id, donation: child, scheduledAt: sub.nextAt });
    await engine.dispatch(sub.id, { donation: child, scheduledAt: new Date() });
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('a persisted reservation cannot send after cancellation wins the row lock', async () => {
    active(); sub.state = 'cancelled'; Object.assign(options, { dispatchEnabled: true });
    attempts.findFirst.mockResolvedValue({ donationId: 'child', donation: { ...order, id: 'child' }, scheduledAt: new Date('2027-01-31T07:00:00Z') });
    await engine.dispatch(sub.id, { donation: { ...order, id: 'child' }, scheduledAt: new Date('2027-01-31T07:00:00Z') });
    expect(sendRecurring).not.toHaveBeenCalled();
  });

  it('skips missed windows rather than reserving catch-up payments', async () => {
    active(); sub.nextAt = new Date('2026-12-31T07:00:00Z');
    Object.assign(options, { dispatchEnabled: true }); jest.spyOn(engine, 'eligibilityVerified').mockReturnValue(true);
    attempts.findFirst.mockResolvedValue(null);
    await engine.reserve(sub.id);
    expect(attempts.create).not.toHaveBeenCalled();
    expect(subscriptions.update).toHaveBeenCalledWith({ where: { id: sub.id }, data: { nextAt: new Date('2027-01-31T07:00:00Z') } });
  });

  it('never publishes the legacy no-email edition as email checkout', () => {
    Object.assign(options, { checkoutEnabled: true, termsVersion: '2026-11-06' });
    expect(worker.checkoutSettings()).toBeNull();
    expect(worker.capabilities().recurring).toBeNull();
  });
});
