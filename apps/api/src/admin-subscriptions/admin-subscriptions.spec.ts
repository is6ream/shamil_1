import { ForbiddenException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../auth/auth.types';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { PrismaService } from '../database/prisma.service';
import {
  createTestDonor,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import { AdminRole, SubscriptionStatus } from '../generated/prisma/enums';
import { BillingService } from '../billing/billing.service';
import { createSubscriptionHarness } from '../subscriptions/testing/subscription-harness';
import type { SubscriptionHarness } from '../subscriptions/testing/subscription-harness';
import { AdminSubscriptionsService } from './admin-subscriptions.service';

const META = { ip: '198.51.100.1', userAgent: 'jest' };

function admin(role: AdminRole): AdminPrincipal {
  return { id: '00000000-0000-4000-8000-000000000001', email: `${role.toLowerCase()}@example.test`, role, displayName: null };
}

describeDatabase('подписки в админке', () => {
  let prisma: PrismaService;
  let harness: SubscriptionHarness;
  let service: AdminSubscriptionsService;
  let subscriptionId: string;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    harness = createSubscriptionHarness(prisma);
    service = new AdminSubscriptionsService(prisma, harness.subscriptions, new AuditService(prisma));

    const donor = await createTestDonor(prisma, 'ivan@example.test');
    const created = await harness.subscriptions.create(
      { id: donor.id, email: 'ivan@example.test' },
      { amountKopecks: 50_000, recurringConsent: true },
    );
    await harness.payments.confirmManual(created.orderId);
    subscriptionId = created.subscriptionId;
  });

  test('адрес жертвователя виден бухгалтеру и скрыт от редактора', async () => {
    // Act
    const forAccountant = await service.list({ page: 1, pageSize: 25 }, admin(AdminRole.ACCOUNTANT));
    const forEditor = await service.list({ page: 1, pageSize: 25 }, admin(AdminRole.EDITOR));

    // Assert
    expect(forAccountant.items[0]?.donorEmail).toBe('ivan@example.test');
    expect(forEditor.items[0]?.donorEmail).toBe('iv***@example.test');
    expect(forAccountant.items[0]).toMatchObject({ paidCount: 1, paidTotalKopecks: '50000' });
  });

  test('поиск по e-mail без доступа к ПДн — 403', async () => {
    await expect(
      service.list({ page: 1, pageSize: 25, email: 'ivan' }, admin(AdminRole.EDITOR)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('статистика: MRR по активным и автосписания по месяцам', async () => {
    // Arrange: одно успешное автосписание
    await prisma.subscription.update({ where: { id: subscriptionId }, data: { nextChargeAt: new Date(Date.now() - 1000) } });
    await new BillingService(prisma, harness.payments, harness.gateway).runTick();

    // Act
    const stats = await service.stats();

    // Assert
    expect(stats).toMatchObject({ active: 1, cancelled: 0, mrrKopecks: '50000' });
    expect(stats.charges).toHaveLength(1);
    expect(stats.charges[0]).toMatchObject({ paid: 1, failed: 0 });
  });

  test('отмена администратором пишется в журнал с прежним статусом; повтор — без записи', async () => {
    // Act
    const first = await service.cancel(subscriptionId, admin(AdminRole.SUPER_ADMIN), META);
    const second = await service.cancel(subscriptionId, admin(AdminRole.SUPER_ADMIN), META);

    // Assert
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(subscription).toMatchObject({ status: SubscriptionStatus.CANCELLED, cancelSource: 'admin' });

    const entries = await prisma.auditLog.findMany({ where: { action: 'subscription.cancel' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entityId: subscriptionId, ip: META.ip });
    expect(entries[0]?.before).toMatchObject({ status: SubscriptionStatus.ACTIVE });
  });
});
