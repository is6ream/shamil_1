import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { PrismaService } from '../database/prisma.service';
import {
  createPendingDonation,
  createTestPrismaService,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus, FundraisingGoalStatus } from '../generated/prisma/enums';
import { GoalProgressCalculator, computeGoalProgress } from './goal-progress.calculator';

const TARGET = 70_000_000n; // 700 000 ₽

describe('computeGoalProgress', () => {
  test('ничего не собрано — 0%, цель не достигнута', () => {
    expect(computeGoalProgress(0n, 0n, TARGET)).toEqual({
      paidKopecks: 0n,
      collectedKopecks: 0n,
      percent: 0,
      isReached: false,
    });
  });

  test('процент округляется вниз: 99,99% — это 99, а не 100', () => {
    // Arrange: на копейку меньше цели
    const progress = computeGoalProgress(TARGET - 1n, 0n, TARGET);

    // Assert
    expect(progress.percent).toBe(99);
    expect(progress.isReached).toBe(false);
  });

  test('корректировка прибавляется к донатам', () => {
    const progress = computeGoalProgress(10_000_000n, 25_000_000n, TARGET);

    expect(progress.collectedKopecks).toBe(35_000_000n);
    expect(progress.percent).toBe(50);
  });

  test('отрицательная корректировка уменьшает сумму, но итог не ниже нуля', () => {
    expect(computeGoalProgress(10_000_000n, -4_000_000n, TARGET).collectedKopecks).toBe(6_000_000n);
    expect(computeGoalProgress(10_000_000n, -50_000_000n, TARGET)).toMatchObject({ collectedKopecks: 0n, percent: 0 });
  });

  test('сбор сверх цели: сумма как есть, процент не больше 100', () => {
    const progress = computeGoalProgress(TARGET * 3n, 0n, TARGET);

    expect(progress.collectedKopecks).toBe(TARGET * 3n);
    expect(progress.percent).toBe(100);
    expect(progress.isReached).toBe(true);
  });

  test('ровно цель — 100% и «достигнута»', () => {
    expect(computeGoalProgress(TARGET, 0n, TARGET)).toMatchObject({ percent: 100, isReached: true });
  });

  test('большие суммы без потери точности (за пределами Number.MAX_SAFE_INTEGER × 100)', () => {
    // Arrange: 100 млн ₽ цели и сумма, у которой точный процент считается только в bigint
    const target = 10_000_000_000n;
    const paid = 9_007_199_254_740_993n; // > 2^53

    // Act
    const progress = computeGoalProgress(paid, 7n, target);

    // Assert
    expect(progress.collectedKopecks).toBe(9_007_199_254_741_000n);
    expect(progress.percent).toBe(100);
    expect(computeGoalProgress(4_999_999_999n, 0n, target).percent).toBe(49);
  });

  test('цель 0 не делит на ноль', () => {
    expect(computeGoalProgress(100n, 0n, 0n).percent).toBe(0);
  });
});

describeDatabase('GoalProgressCalculator на реальной БД', () => {
  let prisma: PrismaService;
  let calculator: GoalProgressCalculator;
  let fixtures: TestFixtures;

  const STARTS = new Date('2026-10-01T00:00:00.000Z');
  const ENDS = new Date('2026-10-31T23:59:59.999Z');

  beforeAll(() => {
    prisma = createTestPrismaService();
    calculator = new GoalProgressCalculator(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  function createGoal(options: { endsAt?: Date | null; adjustment?: bigint } = {}): Promise<{ id: string; targetAmountKopecks: bigint; manualAdjustmentKopecks: bigint }> {
    return prisma.fundraisingGoal.create({
      data: {
        campaignId: fixtures.campaignId,
        title: 'На кирпичи',
        targetAmountKopecks: TARGET,
        startsAt: STARTS,
        endsAt: options.endsAt === undefined ? ENDS : options.endsAt,
        manualAdjustmentKopecks: options.adjustment ?? 0n,
        status: FundraisingGoalStatus.DRAFT,
      },
      select: { id: true, targetAmountKopecks: true, manualAdjustmentKopecks: true },
    });
  }

  async function paid(amount: bigint, paidAt: Date): Promise<void> {
    const donation = await createPendingDonation(prisma, fixtures, { amountKopecks: amount });

    await markPaid(prisma, donation.id, amount, paidAt);
  }

  test('пустая база донатов — 0', async () => {
    // Arrange
    const goal = await createGoal();

    // Act
    const progress = await calculator.progressOf(goal);

    // Assert
    expect(progress).toMatchObject({ paidKopecks: 0n, collectedKopecks: 0n, percent: 0, isReached: false });
  });

  test('границы окна включительно: ровно startsAt и ровно endsAt учитываются, за ними — нет', async () => {
    // Arrange
    const goal = await createGoal();
    await paid(100_00n, STARTS);
    await paid(200_00n, ENDS);
    await paid(400_00n, new Date(STARTS.getTime() - 1));
    await paid(800_00n, new Date(ENDS.getTime() + 1));

    // Act
    const progress = await calculator.progressOf(goal);

    // Assert
    expect(progress.paidKopecks).toBe(300_00n);
  });

  test('без endsAt учитывается всё после startsAt', async () => {
    // Arrange
    const goal = await createGoal({ endsAt: null });
    await paid(100_00n, new Date('2027-05-01T00:00:00.000Z'));

    // Act + Assert
    expect((await calculator.progressOf(goal)).paidKopecks).toBe(100_00n);
  });

  test('завершённый этап без даты окончания не копит пожертвования после завершения', async () => {
    // Arrange
    const goal = await createGoal({ endsAt: null });
    const completedAt = new Date('2026-10-15T00:00:00.000Z');
    await prisma.fundraisingGoal.update({
      where: { id: goal.id },
      data: { status: FundraisingGoalStatus.ACTIVE },
    });
    await prisma.fundraisingGoal.update({
      where: { id: goal.id },
      data: { status: FundraisingGoalStatus.COMPLETED, completedAt },
    });
    await paid(100_00n, completedAt);
    await paid(200_00n, new Date(completedAt.getTime() + 1));

    // Act + Assert: ровно момент завершения ещё в этапе, после — уже нет
    expect((await calculator.progressOf(goal)).paidKopecks).toBe(100_00n);
  });

  test('pending и failed не учитываются', async () => {
    // Arrange
    const goal = await createGoal();
    await paid(100_00n, new Date('2026-10-10T10:00:00.000Z'));
    await createPendingDonation(prisma, fixtures, { amountKopecks: 500_00n });
    const failed = await createPendingDonation(prisma, fixtures, { amountKopecks: 700_00n });
    await prisma.donation.update({ where: { id: failed.id }, data: { status: DonationStatus.failed } });

    // Act + Assert
    expect((await calculator.progressOf(goal)).paidKopecks).toBe(100_00n);
  });

  test('отрицательная корректировка в итоге не уводит ниже нуля', async () => {
    // Arrange
    const goal = await createGoal({ adjustment: -1_000_00n });
    await paid(300_00n, new Date('2026-10-10T10:00:00.000Z'));

    // Act + Assert
    expect(await calculator.progressOf(goal)).toMatchObject({ paidKopecks: 300_00n, collectedKopecks: 0n });
  });

  test('несколько этапов — одним запросом, каждый по своему окну', async () => {
    // Arrange
    const october = await createGoal();
    const always = await createGoal({ endsAt: null });
    await paid(100_00n, new Date('2026-10-10T10:00:00.000Z'));
    await paid(50_00n, new Date('2026-11-10T10:00:00.000Z'));

    // Act
    const sums = await calculator.paidSums([october.id, always.id]);

    // Assert
    expect(sums.get(october.id)).toBe(100_00n);
    expect(sums.get(always.id)).toBe(150_00n);
  });

  test('сбор сверх цели и большие суммы считаются в базе без потерь', async () => {
    // Arrange: 2 × 240 млн ₽ — больше цели этапа в разы
    const goal = await createGoal({ endsAt: null });
    await paid(24_000_000_000n, new Date('2026-10-10T10:00:00.000Z'));
    await paid(24_000_000_000n, new Date('2026-10-11T10:00:00.000Z'));

    // Act
    const progress = await calculator.progressOf(goal);

    // Assert
    expect(progress.collectedKopecks).toBe(48_000_000_000n);
    expect(progress).toMatchObject({ percent: 100, isReached: true });
  });
});
