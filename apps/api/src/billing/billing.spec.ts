import { ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import { RecurringEmulatorOutcome } from '../config/env.validation';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { PrismaService } from '../database/prisma.service';
import {
  TEST_SESSION_ID,
  createTestDonor,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import { DonationStatus, DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import type { ParsedWebhook } from '../payments/payment-provider.types';
import type { ChargeState, RecurringGateway, RecurringSubmitResult } from '../payments/recurring/recurring-gateway';
import { MAX_FAILED_CHARGES } from '../subscriptions/billing-calendar';
import { createSubscriptionHarness } from '../subscriptions/testing/subscription-harness';
import type { SubscriptionHarness } from '../subscriptions/testing/subscription-harness';
import { BillingService } from './billing.service';

const DAY_MS = 24 * 60 * 60_000;

describeDatabase('планировщик автосписаний', () => {
  let prisma: PrismaService;
  let harness: SubscriptionHarness;
  let subscriptionId: string;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setUp(outcome: RecurringEmulatorOutcome): Promise<void> {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    const donor = await createTestDonor(prisma);
    harness = createSubscriptionHarness(prisma, outcome);
    const created = await harness.subscriptions.create(
      { id: donor.id, sessionId: TEST_SESSION_ID, email: 'donor@example.test' },
      { amountKopecks: 50_000, recurringConsent: true },
    );
    await harness.payments.confirmManual(created.orderId);
    subscriptionId = created.subscriptionId;
    // Пора списывать: срок наступил минуту назад
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { nextChargeAt: new Date(Date.now() - 60_000) },
    });
  }

  function billing(gateway: RecurringGateway = harness.gateway): BillingService {
    return new BillingService(prisma, harness.payments, gateway);
  }

  function children(): Promise<{ status: DonationStatus }[]> {
    return prisma.donation.findMany({
      where: { subscriptionId, type: DonationType.CHILD },
      select: { status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  describe('успешное списание', () => {
    beforeEach(() => setUp(RecurringEmulatorOutcome.Paid));

    test('создаёт CHILD, зачисляет его и сдвигает следующий цикл от якоря', async () => {
      // Act
      const result = await billing().runTick();

      // Assert
      expect(result).toMatchObject({ claimed: 1, submitted: 1, reconciled: 1 });
      expect(await children()).toEqual([{ status: DonationStatus.paid }]);

      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
      expect(subscription.cycleNo).toBeGreaterThanOrEqual(2);
      expect(subscription.failCount).toBe(0);
      expect(subscription.nextChargeAt?.getTime()).toBeGreaterThan(Date.now());
      expect(harness.mail.outbox().at(-1)?.kind).toBe('charge_succeeded');
    });

    test('автосписание попадает в сумму сбора тем же триггером, что и разовый донат', async () => {
      // Arrange
      const before = await prisma.campaignStats.findFirstOrThrow();

      // Act
      await billing().runTick();

      // Assert: первый платёж уже учтён, автосписание добавляет ещё 500 ₽
      const after = await prisma.campaignStats.findFirstOrThrow();
      expect(after.paidTotalKopecks - before.paidTotalKopecks).toBe(50_000n);
    });

    test('повторный тик сразу после — второго списания нет', async () => {
      // Act
      await billing().runTick();
      const second = await billing().runTick();

      // Assert
      expect(second.claimed).toBe(0);
      expect(await children()).toHaveLength(1);
    });

    test('два экземпляра одновременно — одно списание', async () => {
      // Act: два «процесса» с разными BillingService
      await Promise.all([billing().runTick(), billing().runTick(), billing().runTick()]);

      // Assert
      expect(await children()).toHaveLength(1);
    });

    test('приостановленная подписка не списывается', async () => {
      // Arrange
      await prisma.subscription.update({ where: { id: subscriptionId }, data: { status: SubscriptionStatus.PAUSED } });

      // Act
      const result = await billing().runTick();

      // Assert
      expect(result.claimed).toBe(0);
    });
  });

  describe('отказы', () => {
    beforeEach(() => setUp(RecurringEmulatorOutcome.Declined));

    test('после отказа следующий тик и параллельные экземпляры не списывают до срока повтора', async () => {
      // Arrange: первый отказ
      await billing().runTick();

      // Act: сразу ещё три тика, два — одновременно
      await billing().runTick();
      await Promise.all([billing().runTick(), billing().runTick()]);

      // Assert: один CHILD, один отказ
      expect(await children()).toEqual([{ status: DonationStatus.failed }]);
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
      expect(subscription.failCount).toBe(1);
    });

    test('повтор через сутки, через трое, после третьего отказа — FAILED и письмо', async () => {
      // Act 1: первый отказ
      await billing().runTick();
      let subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

      // Assert 1
      expect(subscription.failCount).toBe(1);
      expect(subscription.lastFailureReason).toMatch(/Имитация отказа/);
      expect((subscription.nextChargeAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(DAY_MS - 60_000);
      expect(harness.mail.outbox().at(-1)?.kind).toBe('charge_failed');

      // Act 2: второй отказ, через сутки
      await billing().runTick(new Date(Date.now() + DAY_MS + 60_000));
      subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

      // Assert 2: следующий повтор — через трое суток
      expect(subscription.failCount).toBe(2);
      expect((subscription.nextChargeAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(3 * DAY_MS - 60_000);

      // Act 3: третий отказ
      await billing().runTick(new Date(Date.now() + 4 * DAY_MS));
      subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });

      // Assert 3
      expect(subscription.failCount).toBe(MAX_FAILED_CHARGES);
      expect(subscription.status).toBe(SubscriptionStatus.FAILED);
      expect(harness.mail.outbox().at(-1)?.kind).toBe('subscription_failed');
      expect((await children()).map((child) => child.status)).toEqual([
        DonationStatus.failed,
        DonationStatus.failed,
        DonationStatus.failed,
      ]);
    });
  });

  describe('Result URL по автосписанию', () => {
    beforeEach(() => setUp(RecurringEmulatorOutcome.Paid));

    /** Robokassa, которая принимает списание и (после задержки) сообщает об успехе. */
    function robokassa(reconcileDelayMs: number): RecurringGateway {
      return {
        providerCode: ROBOKASSA_PROVIDER_CODE,
        reconcileDelayMs,
        submit: async (): Promise<RecurringSubmitResult> => ({ accepted: true }),
        checkState: async (): Promise<ChargeState> => ({ kind: 'paid', amountKopecks: 50_000n }),
      };
    }

    /** Колбэк в том виде, в каком его отдаёт RobokassaProvider.parseWebhook: ключ — InvId. */
    async function deliverResultUrl(invoiceNo: number): Promise<void> {
      const parsed: ParsedWebhook = {
        provider: ROBOKASSA_PROVIDER_CODE,
        providerEventId: String(invoiceNo),
        invoiceNo,
        status: DonationStatus.paid,
        amountKopecks: 50_000n,
        acknowledgement: `OK${invoiceNo}`,
      };

      await harness.payments.applyWebhook(parsed, { OutSum: '500.00', InvId: String(invoiceNo) });
    }

    async function pendingChildInvoice(): Promise<number> {
      const child = await prisma.donation.findFirstOrThrow({
        where: { subscriptionId, type: DonationType.CHILD },
        select: { invoiceNo: true, status: true },
      });
      expect(child.status).toBe(DonationStatus.pending);

      return child.invoiceNo;
    }

    test('повтор колбэка по CHILD не задваивает ни сбор, ни цикл подписки', async () => {
      // Arrange: списание отправлено, сверка ещё не наступила
      await billing(robokassa(60 * 60_000)).runTick();
      const invoiceNo = await pendingChildInvoice();
      const before = await prisma.campaignStats.findFirstOrThrow();

      // Act: Robokassa ретраит Result URL
      await deliverResultUrl(invoiceNo);
      await deliverResultUrl(invoiceNo);

      // Assert
      expect(await children()).toEqual([{ status: DonationStatus.paid }]);
      const after = await prisma.campaignStats.findFirstOrThrow();
      expect(after.paidTotalKopecks - before.paidTotalKopecks).toBe(50_000n);
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
      expect(subscription.cycleNo).toBe(2);
      expect(harness.mail.outbox().filter((mail) => mail.kind === 'charge_succeeded')).toHaveLength(1);
    });

    test('сверка успела раньше колбэка — поздний Result URL ложится повтором', async () => {
      // Arrange: сверка OpStateExt зачисляет CHILD в том же тике
      await billing(robokassa(0)).runTick();
      const child = await prisma.donation.findFirstOrThrow({ where: { subscriptionId, type: DonationType.CHILD } });
      expect(child.status).toBe(DonationStatus.paid);
      const before = await prisma.campaignStats.findFirstOrThrow();

      // Act
      await deliverResultUrl(child.invoiceNo);

      // Assert
      const after = await prisma.campaignStats.findFirstOrThrow();
      expect(after.paidTotalKopecks).toBe(before.paidTotalKopecks);
      expect(await prisma.paymentEvent.count({ where: { donationId: child.id } })).toBe(1);
    });
  });

  describe('сбои шлюза', () => {
    beforeEach(() => setUp(RecurringEmulatorOutcome.Paid));

    test('провайдер отказал сразу — отказ записан, повтор по расписанию', async () => {
      // Arrange
      const rejecting: RecurringGateway = {
        providerCode: 'manual',
        reconcileDelayMs: 60_000,
        submit: async (): Promise<RecurringSubmitResult> => ({ accepted: false, reason: 'ERROR: карта отвязана' }),
        checkState: async (): Promise<ChargeState> => ({ kind: 'pending' }),
      };

      // Act
      await billing(rejecting).runTick();

      // Assert
      const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
      expect(await children()).toEqual([{ status: DonationStatus.failed }]);
      expect(subscription.failCount).toBe(1);
      expect(subscription.lastFailureReason).toBe('ERROR: карта отвязана');
    });

    test('сеть упала на отправке — не повторяем, пока сверка не скажет, что запроса не было', async () => {
      // Arrange
      const offline: RecurringGateway = {
        providerCode: 'manual',
        reconcileDelayMs: 60 * 60_000,
        submit: async (): Promise<RecurringSubmitResult> => {
          throw new Error('ECONNRESET');
        },
        checkState: async (): Promise<ChargeState> => ({ kind: 'not_found' }),
      };

      // Act: два тика подряд — второго запроса быть не должно
      await billing(offline).runTick();
      const second = await billing(offline).runTick();

      // Assert
      expect(second.claimed).toBe(0);
      expect(await children()).toEqual([{ status: DonationStatus.pending }]);

      // Act: через час сверка видит «операция не найдена»
      await billing(offline).runTick(new Date(Date.now() + 61 * 60_000));

      // Assert
      expect(await children()).toEqual([{ status: DonationStatus.failed }]);
    });
  });
});
