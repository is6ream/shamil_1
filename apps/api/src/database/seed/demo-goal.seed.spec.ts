import { CAMPAIGN_SLUG } from './campaign.data';
import { createTestClient, describeDatabase, resetDatabase, seedFixtures } from '../testing/test-database';
import type { PrismaClient } from '../../generated/prisma/client';
import { isDemoGoalAllowed, seedDemoGoal } from './demo-goal.seed';

describe('демо-этап: где разрешён', () => {
  test.each([
    ['production', false],
    ['test', false],
    [undefined, false],
    ['', false],
    ['development', true],
  ])('NODE_ENV=%s → %s', (nodeEnv, expected) => {
    expect(isDemoGoalAllowed({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv)).toBe(expected);
  });
});

describeDatabase('демо-этап в базе', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
  });

  test('в production ничего не создаёт', async () => {
    expect(await seedDemoGoal(prisma, { NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('skipped-env');
    expect(await prisma.fundraisingGoal.count()).toBe(0);
  });

  test('в development создаёт один активный этап и повторно не дублирует', async () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

    expect(await seedDemoGoal(prisma, env)).toBe('created');
    expect(await seedDemoGoal(prisma, env)).toBe('skipped-exists');
    expect(await prisma.fundraisingGoal.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });
});
