import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { PrismaService } from '../database/prisma.service';
import {
  createTestDonor,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import { DonationStatus, DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import { PaymentProviderResolver } from '../payments/payment-provider.resolver';
import { ManualProvider } from '../payments/providers/manual.provider';
import { CancelByLinkController } from '../donor-cabinet/donor-cabinet.controller';
import { CreateSubscriptionDto } from './dto/subscription.dto';
import { CANCEL_LINK_TTL_MS } from './subscriptions.constants';
import { SubscriptionsService } from './subscriptions.service';
import { HARNESS_SITE_URL, createSubscriptionHarness } from './testing/subscription-harness';
import type { SubscriptionHarness } from './testing/subscription-harness';

const EMAIL = 'donor@example.test';

describe('CreateSubscriptionDto', () => {
  function errorsFor(body: Record<string, unknown>): string[] {
    return validateSync(plainToInstance(CreateSubscriptionDto, body)).map((error) => error.property);
  }

  test('без явного согласия на автосписания — ошибка', () => {
    expect(errorsFor({ amountKopecks: 50_000 })).toContain('recurringConsent');
    expect(errorsFor({ amountKopecks: 50_000, recurringConsent: false })).toContain('recurringConsent');
  });

  test('сумма — от 10 ₽ (как у разового доната) до 10 000 000 ₽', () => {
    expect(errorsFor({ amountKopecks: 999, recurringConsent: true })).toContain('amountKopecks');
    expect(errorsFor({ amountKopecks: 1_000, recurringConsent: true })).toEqual([]);
    expect(errorsFor({ amountKopecks: 1_000_000_001, recurringConsent: true })).toContain('amountKopecks');
    expect(errorsFor({ amountKopecks: 10_000, recurringConsent: true })).toEqual([]);
  });
});

describeDatabase('подписки: оформление и первый платёж', () => {
  let prisma: PrismaService;
  let harness: SubscriptionHarness;
  let donor: { id: string; email: string };

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    donor = { id: (await createTestDonor(prisma, EMAIL)).id, email: EMAIL };
    harness = createSubscriptionHarness(prisma);
  });

  async function subscribe(amountKopecks = 50_000, regionSlug?: string): Promise<{ subscriptionId: string; orderId: string }> {
    return harness.subscriptions.create(donor, { amountKopecks, recurringConsent: true, regionSlug }, '203.0.113.7');
  }

  test('оформление создаёт PENDING-подписку, PARENT-донат и сохраняет согласие', async () => {
    // Act
    const created = await subscribe(50_000, '02');

    // Assert
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });
    const parent = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });
    expect(subscription.status).toBe(SubscriptionStatus.PENDING);
    expect(subscription.consentAcceptedAt).toBeInstanceOf(Date);
    expect(subscription.consentIp).toBe('203.0.113.7');
    expect(subscription.regionId).not.toBeNull();
    expect(parent).toMatchObject({ type: DonationType.PARENT, userId: donor.id, status: DonationStatus.pending });
  });

  test('первый платёж активирует подписку: якорь, первый цикл, письмо со ссылкой отмены', async () => {
    // Arrange
    const created = await subscribe();

    // Act
    await harness.payments.confirmManual(created.orderId);

    // Assert
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });
    const parent = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.parentInvoiceNo).toBe(parent.invoiceNo);
    expect(subscription.billingAnchorDate).not.toBeNull();
    expect(subscription.nextChargeAt?.getTime()).toBeGreaterThan(Date.now());
    expect(subscription.cycleNo).toBe(1);

    const mail = harness.mail.outbox().at(-1);
    expect(mail?.kind).toBe('subscription_started');
    expect(mail?.text).toContain(`${HARNESS_SITE_URL}/cabinet/cancel?token=`);
  });

  test('повторное подтверждение первого платежа ничего не меняет и писем не шлёт', async () => {
    // Arrange
    const created = await subscribe();
    await harness.payments.confirmManual(created.orderId);
    const before = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });

    // Act
    const second = await harness.payments.confirmManual(created.orderId);

    // Assert
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });
    expect(second.applied).toBe(false);
    expect(after.nextChargeAt).toEqual(before.nextChargeAt);
    expect(harness.mail.outbox().filter((mail) => mail.kind === 'subscription_started')).toHaveLength(1);
  });

  test('новое оформление отменяет незавершённое предыдущее', async () => {
    // Arrange
    const first = await subscribe();

    // Act
    await subscribe(100_000);

    // Assert
    const old = await prisma.subscription.findUniqueOrThrow({ where: { id: first.subscriptionId } });
    expect(old.status).toBe(SubscriptionStatus.CANCELLED);
    expect(old.cancelSource).toBe('donor');
  });

  test('без шлюза автосписаний оформить подписку нельзя', async () => {
    // Arrange: production с PAYMENT_PROVIDER=manual
    const resolver = new PaymentProviderResolver({
      manual: new ManualProvider(harness.config),
      online: null,
      defaultChannel: 'transfer',
    });
    const service = new SubscriptionsService(prisma, resolver, null, harness.notifier);

    // Act & Assert
    await expect(service.create(donor, { amountKopecks: 50_000, recurringConsent: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('отмена: владелец — да, чужой — 404, повтор — no-op с одним письмом', async () => {
    // Arrange
    const created = await subscribe();
    await harness.payments.confirmManual(created.orderId);
    const stranger = await createTestDonor(prisma, 'other@example.test');

    // Act & Assert
    await expect(
      harness.subscriptions.cancel(created.subscriptionId, 'donor', { ownerId: stranger.id }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const first = await harness.subscriptions.cancel(created.subscriptionId, 'donor', { ownerId: donor.id });
    const second = await harness.subscriptions.cancel(created.subscriptionId, 'link');

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });
    expect(subscription).toMatchObject({ status: SubscriptionStatus.CANCELLED, cancelSource: 'donor' });
    expect(harness.mail.outbox().filter((mail) => mail.kind === 'subscription_cancelled')).toHaveLength(1);
  });

  test('ссылка отмены подписана: чужая подпись, подделанный срок и мусор не проходят', async () => {
    // Arrange
    const created = await subscribe();
    const token = harness.links.cancelToken(created.subscriptionId);
    const [id, expiresAt] = token.split('.');

    // Act & Assert
    expect(harness.links.checkCancelToken(token)).toEqual({ kind: 'valid', subscriptionId: created.subscriptionId });
    expect(harness.links.checkCancelToken(`${id}.${expiresAt}.${'0'.repeat(32)}`)).toEqual({ kind: 'invalid' });
    expect(harness.links.checkCancelToken(token.replace(`.${expiresAt}.`, `.${Number(expiresAt) + 86_400}.`))).toEqual({
      kind: 'invalid',
    });
    expect(harness.links.checkCancelToken(`${id}.${token.split('.')[2]}`)).toEqual({ kind: 'invalid' });
    expect(harness.links.checkCancelToken('мусор')).toEqual({ kind: 'invalid' });
  });

  test('ссылка отмены живёт CANCEL_LINK_TTL_DAYS суток', async () => {
    // Arrange
    const created = await subscribe();
    const issuedAt = new Date('2026-11-01T09:00:00.000Z');
    const token = harness.links.cancelToken(created.subscriptionId, issuedAt);

    // Act & Assert
    expect(harness.links.checkCancelToken(token, new Date(issuedAt.getTime() + CANCEL_LINK_TTL_MS - 1_000)).kind).toBe('valid');
    expect(harness.links.checkCancelToken(token, new Date(issuedAt.getTime() + CANCEL_LINK_TTL_MS))).toEqual({ kind: 'expired' });
  });

  test('отмена по ссылке: источник link, повтор — тот же ответ, истёкшая — 410, чужая — 404', async () => {
    // Arrange
    const created = await subscribe();
    await harness.payments.confirmManual(created.orderId);
    const controller = new CancelByLinkController(harness.subscriptions, harness.links);
    const token = harness.links.cancelToken(created.subscriptionId);
    const expired = harness.links.cancelToken(created.subscriptionId, new Date(Date.now() - CANCEL_LINK_TTL_MS - 1_000));

    // Act & Assert: истёкшая и подделанная ссылки ничего не меняют
    await expect(controller.cancelByLink({ token: expired })).rejects.toBeInstanceOf(GoneException);
    const forged = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    await expect(controller.cancelByLink({ token: forged })).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } })).status).toBe(
      SubscriptionStatus.ACTIVE,
    );

    // Act: два нажатия подряд
    const first = await controller.cancelByLink({ token });
    const second = await controller.cancelByLink({ token });

    // Assert
    expect(first).toEqual({ cancelled: true });
    expect(second).toEqual({ cancelled: true });
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: created.subscriptionId } });
    expect(subscription).toMatchObject({ status: SubscriptionStatus.CANCELLED, cancelSource: 'link' });
    expect(harness.mail.outbox().filter((mail) => mail.kind === 'subscription_cancelled')).toHaveLength(1);
  });
});
