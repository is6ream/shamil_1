import type { PrismaClient } from '../generated/prisma/client';
import { DonationType, SubscriptionStatus } from '../generated/prisma/enums';
import {
  createPendingDonation,
  createTestClient,
  createTestDonor,
  createTestSubscription,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from './testing/test-database';
import type { TestFixtures } from './testing/test-database';

/**
 * Гарантии подписок, которые держит сама база. Планировщик работает
 * в нескольких экземплярах (Timeweb App Platform), и защита от двойного
 * списания обязана жить в индексах и триггерах, а не в памяти процесса.
 */
describeDatabase('подписки: гарантии схемы', () => {
  let prisma: PrismaClient;
  let fixtures: TestFixtures;
  let userId: string;

  beforeAll(() => {
    prisma = createTestClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
    userId = (await createTestDonor(prisma)).id;
  });

  function createChild(subscriptionId: string): Promise<unknown> {
    return prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        amountKopecks: 10_000n,
        provider: 'robokassa',
        type: DonationType.CHILD,
        subscriptionId,
        userId,
      },
    });
  }

  test('второй pending CHILD по подписке не записывается — это двойное списание', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId, { active: true });
    await createChild(subscription.id);

    // Act & Assert
    await expect(createChild(subscription.id)).rejects.toThrow(/donation_one_pending_child_per_subscription|Unique/);
  });

  test('второй PARENT у подписки не записывается', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId);

    // Act
    const act = prisma.donation.create({
      data: {
        campaignId: fixtures.campaignId,
        amountKopecks: 10_000n,
        provider: 'robokassa',
        type: DonationType.PARENT,
        subscriptionId: subscription.id,
        userId,
      },
    });

    // Assert
    await expect(act).rejects.toThrow(/donation_one_parent_per_subscription|Unique/);
  });

  test('разовый донат не может принадлежать подписке', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId);
    const donation = await createPendingDonation(prisma, fixtures);

    // Act
    const act = prisma.donation.update({ where: { id: donation.id }, data: { subscriptionId: subscription.id } });

    // Assert
    await expect(act).rejects.toThrow(/donation_type_subscription_consistency/);
  });

  test('ACTIVE без первого платежа не бывает', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId);

    // Act
    const act = prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.ACTIVE, nextChargeAt: new Date() },
    });

    // Assert
    await expect(act).rejects.toThrow(/subscription_active_has_parent/);
  });

  test('ACTIVE без даты следующего списания не бывает', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId, { active: true });

    // Act
    const act = prisma.subscription.update({ where: { id: subscription.id }, data: { nextChargeAt: null } });

    // Assert
    await expect(act).rejects.toThrow(/subscription_active_scheduled/);
  });

  test('отмена без источника и времени не записывается', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId, { active: true });

    // Act
    const act = prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    });

    // Assert
    await expect(act).rejects.toThrow(/subscription_cancel_source_consistency/);
  });

  test('отменённую подписку не возобновить даже в обход сервиса', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId, { active: true });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), cancelSource: 'donor' },
    });

    // Act
    const act = prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.ACTIVE, cancelledAt: null, cancelSource: null },
    });

    // Assert
    await expect(act).rejects.toThrow(/subscription_status_guard/);
  });

  test('причина отказа пишется только вместе со временем отказа', async () => {
    // Arrange
    const subscription = await createTestSubscription(prisma, fixtures, userId, { active: true });

    // Act
    const act = prisma.subscription.update({
      where: { id: subscription.id },
      data: { lastFailureReason: 'Недостаточно средств' },
    });

    // Assert
    await expect(act).rejects.toThrow(/subscription_failure_fields/);
  });

  test('e-mail жертвователя хранится только в нижнем регистре', async () => {
    await expect(createTestDonor(prisma, 'Donor@Example.test')).rejects.toThrow(/donor_user_email_lowercase/);
  });
});
