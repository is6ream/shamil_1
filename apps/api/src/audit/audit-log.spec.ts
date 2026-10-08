import type { PrismaService } from '../database/prisma.service';
import { seedSuperAdmin } from '../database/seed/admin.seed';
import { createTestPrismaService, describeDatabase, resetDatabase } from '../database/testing/test-database';
import { AdminRole } from '../generated/prisma/enums';
import { AuditService } from './audit.service';

describeDatabase('журнал действий в базе', () => {
  let prisma: PrismaService;
  let audit: AuditService;

  jest.setTimeout(30_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
    audit = new AuditService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('запись журнала нельзя исправить или удалить', async () => {
    // Arrange
    await audit.record(undefined, {
      actor: { type: 'system', label: 'test' },
      action: 'test.event',
      entityType: 'test',
    });
    const entry = await prisma.auditLog.findFirstOrThrow();

    // Act
    const update = prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'test.forged' } });
    const remove = prisma.auditLog.delete({ where: { id: entry.id } });

    // Assert
    await expect(update).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    await expect(remove).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
  });

  test('запись журнала откатывается вместе с транзакцией изменения', async () => {
    // Act
    const failing = prisma.$transaction(async (tx) => {
      await audit.record(tx, { actor: { type: 'system', label: 'test' }, action: 'test.event', entityType: 'test' });
      throw new Error('изменение не удалось');
    });

    // Assert
    await expect(failing).rejects.toThrow('изменение не удалось');
    expect(await prisma.auditLog.count()).toBe(0);
  });

  test('пользовательская запись без id пользователя не принимается базой', async () => {
    // Act
    const act = prisma.auditLog.create({ data: { actorType: 'user', action: 'x', entityType: 'y' } });

    // Assert
    await expect(act).rejects.toThrow();
  });

  test('ПДн в before/after маскируются до записи', async () => {
    // Act
    await audit.record(undefined, {
      actor: { type: 'system', label: 'test' },
      action: 'donation.update',
      entityType: 'donation',
      after: { contact: { phoneE164: '+79991234567', fullName: 'Иван' } },
    });

    // Assert
    const entry = await prisma.auditLog.findFirstOrThrow();
    expect(JSON.stringify(entry.after)).not.toMatch(/7999|Иван/);
  });
});

describeDatabase('сид суперадмина', () => {
  let prisma: PrismaService;

  jest.setTimeout(30_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('создаёт суперадмина один раз и не трогает его при повторе', async () => {
    // Arrange
    const env = { ADMIN_SEED_EMAIL: 'Owner@Example.test', ADMIN_SEED_PASSWORD: 'first-strong-pass' };

    // Act
    const first = await seedSuperAdmin(prisma, env);
    const created = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'owner@example.test' } });
    const second = await seedSuperAdmin(prisma, { ...env, ADMIN_SEED_PASSWORD: 'other-strong-pass' });

    // Assert
    const after = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'owner@example.test' } });
    expect(first).toBe('created');
    expect(second).toBe('exists');
    expect(created.role).toBe(AdminRole.SUPER_ADMIN);
    expect(after.passwordHash).toBe(created.passwordHash);
  });

  test('без переменных окружения ничего не создаёт', async () => {
    // Act
    const outcome = await seedSuperAdmin(prisma, {});

    // Assert
    expect(outcome).toBe('skipped');
    expect(await prisma.adminUser.count()).toBe(0);
  });

  test('слабый пароль из окружения не заводится', async () => {
    // Act
    const act = seedSuperAdmin(prisma, { ADMIN_SEED_EMAIL: 'a@b.test', ADMIN_SEED_PASSWORD: 'short' });

    // Assert
    await expect(act).rejects.toThrow(/не короче/);
  });
});
