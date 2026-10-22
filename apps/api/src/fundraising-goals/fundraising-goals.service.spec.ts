import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  createPendingDonation,
  createTestAdmin,
  createTestPrismaService,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { AdminRole, FundraisingGoalStatus } from '../generated/prisma/enums';
import { RevalidationService } from '../revalidation/revalidation.service';
import { ActiveGoalService } from './active-goal.service';
import { CreateGoalDto, GoalListQueryDto } from './dto/goal.dto';
import { FundraisingGoalsRepository } from './fundraising-goals.repository';
import { FundraisingGoalsService } from './fundraising-goals.service';
import { GoalProgressCalculator } from './goal-progress.calculator';

const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };

function goalDto(overrides: Partial<CreateGoalDto> = {}): CreateGoalDto {
  return Object.assign(new CreateGoalDto(), {
    title: 'На кирпичи',
    targetAmountKopecks: '70000000',
    startsAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  });
}

describeDatabase('FundraisingGoalsService', () => {
  let prisma: PrismaService;
  let service: FundraisingGoalsService;
  let activeGoal: ActiveGoalService;
  let revalidation: RevalidationService;
  let fixtures: TestFixtures;
  let editor: AdminPrincipal;

  jest.setTimeout(60_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
    revalidation = new RevalidationService(
      new ConfigService<AppConfig, true>({ revalidation: { url: 'http://127.0.0.1:9/api/revalidate' } }),
    );
    const repository = new FundraisingGoalsRepository(prisma);
    const calculator = new GoalProgressCalculator(prisma);

    activeGoal = new ActiveGoalService(repository, calculator);
    service = new FundraisingGoalsService(prisma, repository, calculator, activeGoal, new AuditService(prisma), revalidation);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // TRUNCATE идёт мимо сервиса — кеш публичного ответа от прошлого теста сбрасываем сами.
    activeGoal.invalidate();
    fixtures = await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    const admin = await createTestAdmin(prisma, { email: 'editor@example.test', role: AdminRole.EDITOR });
    editor = { id: admin.id, email: admin.email, role: admin.role, displayName: null };
  });

  test('создаётся черновиком, с автором и в журнале', async () => {
    // Act
    const goal = await service.create(goalDto({ description: 'Первый этаж' }), editor, META);
    const audit = await prisma.auditLog.findMany({ where: { entityId: goal.id } });

    // Assert
    expect(goal).toMatchObject({
      status: FundraisingGoalStatus.DRAFT,
      title: 'На кирпичи',
      description: 'Первый этаж',
      targetAmountKopecks: '70000000',
      collectedAmountKopecks: '0',
      createdBy: 'editor@example.test',
    });
    expect(audit.map((row) => row.action)).toEqual(['fundraising_goal.create']);
  });

  test('активация второй цели завершает первую в той же транзакции', async () => {
    // Arrange
    const first = await service.create(goalDto(), editor, META);
    const second = await service.create(goalDto({ title: 'На кровлю' }), editor, META);
    await service.activate(first.id, editor, META);

    // Act
    const activated = await service.activate(second.id, editor, META);
    const previous = await service.get(first.id);

    // Assert
    expect(activated.status).toBe(FundraisingGoalStatus.ACTIVE);
    expect(previous.status).toBe(FundraisingGoalStatus.COMPLETED);
    expect(previous.completedAt).not.toBeNull();
    expect(await prisma.fundraisingGoal.count({ where: { status: FundraisingGoalStatus.ACTIVE } })).toBe(1);
  });

  test('конкурентная активация: параллельная транзакция уже сменила активный этап — 409', async () => {
    // Arrange: A активен, B и C — черновики
    const a = await service.create(goalDto({ title: 'Этап A' }), editor, META);
    const b = await service.create(goalDto({ title: 'Этап B' }), editor, META);
    const c = await service.create(goalDto({ title: 'Этап C' }), editor, META);
    await service.activate(a.id, editor, META);

    let release!: () => void;
    let markApplied!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const applied = new Promise<void>((resolve) => (markApplied = resolve));

    // Другая вкладка админки: завершила A и включила B, но ещё не закоммитила.
    const concurrent = prisma.$transaction(
      async (tx) => {
        await tx.fundraisingGoal.update({
          where: { id: a.id },
          data: { status: FundraisingGoalStatus.COMPLETED, completedAt: new Date() },
        });
        await tx.fundraisingGoal.update({ where: { id: b.id }, data: { status: FundraisingGoalStatus.ACTIVE } });
        markApplied();
        await gate;
      },
      { timeout: 20_000 },
    );

    await applied;

    // Act: наша активация C ждёт блокировку строки A
    const ours = service.activate(c.id, editor, META);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await concurrent;

    // Assert
    await expect(ours).rejects.toBeInstanceOf(ConflictException);
    const active = await prisma.fundraisingGoal.findMany({ where: { status: FundraisingGoalStatus.ACTIVE }, select: { id: true } });
    expect(active).toEqual([{ id: b.id }]);
  });

  test('две активации одновременно через сервис: активный этап всегда один, проигравший — 409', async () => {
    // Arrange
    const a = await service.create(goalDto({ title: 'Этап A' }), editor, META);
    const b = await service.create(goalDto({ title: 'Этап B' }), editor, META);

    // Act
    const results = await Promise.allSettled([service.activate(a.id, editor, META), service.activate(b.id, editor, META)]);

    // Assert
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ConflictException);
      }
    }
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.fundraisingGoal.count({ where: { status: FundraisingGoalStatus.ACTIVE } })).toBe(1);
  });

  test('из COMPLETED и ARCHIVED в DRAFT не вернуться; из ARCHIVED — никуда', async () => {
    // Arrange
    const goal = await service.create(goalDto(), editor, META);
    await service.activate(goal.id, editor, META);
    await service.complete(goal.id, editor, META);

    // Act + Assert: прямой UPDATE мимо сервиса режет триггер БД
    await expect(
      prisma.fundraisingGoal.update({ where: { id: goal.id }, data: { status: FundraisingGoalStatus.DRAFT } }),
    ).rejects.toThrow(/DRAFT/);

    await service.archive(goal.id, editor, META);

    await expect(service.activate(goal.id, editor, META)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(goal.id, { title: 'Новое' }, editor, META)).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.fundraisingGoal.update({ where: { id: goal.id }, data: { status: FundraisingGoalStatus.COMPLETED } }),
    ).rejects.toThrow(/ARCHIVED/);
  });

  test('завершённый этап можно снова сделать активным', async () => {
    // Arrange
    const goal = await service.create(goalDto(), editor, META);
    await service.activate(goal.id, editor, META);
    await service.complete(goal.id, editor, META);

    // Act
    const again = await service.activate(goal.id, editor, META);

    // Assert
    expect(again).toMatchObject({ status: FundraisingGoalStatus.ACTIVE, completedAt: null });
  });

  test('завершить можно только активный', async () => {
    const goal = await service.create(goalDto(), editor, META);

    await expect(service.complete(goal.id, editor, META)).rejects.toBeInstanceOf(ConflictException);
  });

  test('физически удалить этап нельзя даже мимо API', async () => {
    const goal = await service.create(goalDto(), editor, META);

    await expect(prisma.fundraisingGoal.delete({ where: { id: goal.id } })).rejects.toThrow(/удаление запрещено/);
  });

  test('границы суммы и периода — 400', async () => {
    await expect(service.create(goalDto({ targetAmountKopecks: '99999' }), editor, META)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(goalDto({ targetAmountKopecks: '10000000001' }), editor, META)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create(goalDto({ endsAt: '2026-09-01T00:00:00.000Z' }), editor, META),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(goalDto({ manualAdjustmentKopecks: '-10000000001' }), editor, META),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('неизвестный id — 404', async () => {
    await expect(service.activate('00000000-0000-4000-8000-000000000001', editor, META)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('публичный ответ: активный этап с прогрессом, корректировка и сброс кеша после правки', async () => {
    // Arrange
    const goal = await service.create(goalDto(), editor, META);
    await service.activate(goal.id, editor, META);
    const donation = await createPendingDonation(prisma, fixtures, { amountKopecks: 7_000_000n });
    await markPaid(prisma, donation.id, 7_000_000n, new Date('2026-10-05T10:00:00.000Z'));

    // Act
    const before = await activeGoal.getActive();
    await service.update(goal.id, { manualAdjustmentKopecks: '28000000' }, editor, META);
    const after = await activeGoal.getActive();

    // Assert
    expect(before).toEqual({
      id: goal.id,
      title: 'На кирпичи',
      description: null,
      targetAmountKopecks: '70000000',
      collectedAmountKopecks: '7000000',
      percent: 10,
      isReached: false,
    });
    expect(after).toMatchObject({ collectedAmountKopecks: '35000000', percent: 50 });
  });

  test('нет активного этапа — null; архив активного убирает его с главной', async () => {
    // Arrange
    const goal = await service.create(goalDto(), editor, META);
    expect(await activeGoal.getActive()).toBeNull();
    await service.activate(goal.id, editor, META);

    // Act
    await service.archive(goal.id, editor, META);

    // Assert
    expect(await activeGoal.getActive()).toBeNull();
  });

  test('сохранение не падает, когда сайт для ревалидации недоступен', async () => {
    // Arrange: ревалидация уходит на закрытый порт
    const notify = jest.spyOn(revalidation, 'notify');
    const goal = await service.create(goalDto(), editor, META);

    // Act
    const activated = await service.activate(goal.id, editor, META);

    // Assert
    expect(activated.status).toBe(FundraisingGoalStatus.ACTIVE);
    expect(notify).toHaveBeenCalledWith(['active-goal']);
    await expect(notify.mock.results[0]?.value).resolves.toBeUndefined();
  });

  test('список: активный первым, прогресс посчитан, пагинация', async () => {
    // Arrange
    const draft = await service.create(goalDto({ title: 'Черновик' }), editor, META);
    const active = await service.create(goalDto({ title: 'Активный' }), editor, META);
    await service.activate(active.id, editor, META);

    // Act
    const page = await service.list(Object.assign(new GoalListQueryDto(), { page: 1, pageSize: 10 }));

    // Assert
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([active.id, draft.id]);
    expect(page.items[0]).toMatchObject({ percent: 0, collectedAmountKopecks: '0' });
  });
});
