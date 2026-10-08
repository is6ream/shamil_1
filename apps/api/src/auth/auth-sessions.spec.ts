import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../database/prisma.service';
import {
  TEST_ADMIN_PASSWORD,
  createTestAdmin,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
} from '../database/testing/test-database';
import { AdminRole } from '../generated/prisma/enums';
import { AccessTokenService } from './access-token.service';
import { AdminUsersService } from './admin-users.service';
import { LOGIN_LOCK_MS, MAX_FAILED_LOGINS } from './auth.constants';
import { AuthService, LOGIN_FAILED_MESSAGE } from './auth.service';
import type { AdminPrincipal, RequestMeta } from './auth.types';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import { RefreshTokenService, hashRefreshToken } from './refresh-token.service';

/**
 * Сессии админки на реальном PostgreSQL: ротация refresh-токенов, отзыв
 * семейства при повторе, блокировка после серии неудач, мгновенное
 * погашение access-токенов. Всё это держится на условных UPDATE —
 * на моках проверять нечего.
 */

const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };

describeDatabase('сессии админки', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let users: AdminUsersService;
  let guard: JwtAuthGuard;

  jest.setTimeout(60_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
    const passwords = new PasswordService();
    const accessTokens = new AccessTokenService(new JwtService({ secret: 'test-secret-'.padEnd(40, 'x') }));
    const refreshTokens = new RefreshTokenService(prisma);

    auth = new AuthService(prisma, passwords, accessTokens, refreshTokens);
    users = new AdminUsersService(prisma, passwords, refreshTokens, new AuditService(prisma));
    guard = new JwtAuthGuard(accessTokens, prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  test('вход выдаёт access-токен, который принимает гард', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma, { role: AdminRole.EDITOR });

    // Act
    const session = await auth.login('  ADMIN@example.test ', TEST_ADMIN_PASSWORD, META);
    const principal = await guard.authenticate(session.accessToken);

    // Assert
    expect(principal).toMatchObject({ id: admin.id, role: AdminRole.EDITOR });
    expect(session.refreshToken.length).toBeGreaterThanOrEqual(43);
  });

  test('в базе лежит только SHA-256 refresh-токена', async () => {
    // Arrange
    await createTestAdmin(prisma);

    // Act
    const session = await auth.login('admin@example.test', TEST_ADMIN_PASSWORD, META);

    // Assert
    const stored = await prisma.adminRefreshToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(stored.tokenHash).not.toContain(session.refreshToken);
  });

  test('нет пользователя и неверный пароль — один и тот же ответ', async () => {
    // Arrange
    await createTestAdmin(prisma);

    // Act & Assert
    await expect(auth.login('nobody@example.test', TEST_ADMIN_PASSWORD, META)).rejects.toThrow(
      new UnauthorizedException(LOGIN_FAILED_MESSAGE),
    );
    await expect(auth.login('admin@example.test', 'wrong-password-123', META)).rejects.toThrow(
      new UnauthorizedException(LOGIN_FAILED_MESSAGE),
    );
  });

  test(`${MAX_FAILED_LOGINS} неудач подряд блокируют вход даже с верным паролем`, async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);

    for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      await expect(auth.login(admin.email, 'wrong-password-123', META)).rejects.toThrow(UnauthorizedException);
    }

    // Act
    const act = auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Assert
    await expect(act).rejects.toThrow(new UnauthorizedException(LOGIN_FAILED_MESSAGE));
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.lockedUntil?.getTime()).toBeGreaterThan(Date.now() + LOGIN_LOCK_MS - 60_000);
  });

  test('после окончания блокировки верный пароль пускает и сбрасывает счётчик', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() - 1000) },
    });

    // Act
    await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Assert
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.failedLoginCount).toBe(0);
    expect(stored.lockedUntil).toBeNull();
    expect(stored.lastLoginAt).not.toBeNull();
  });

  test('деактивированный пользователь не входит', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma, { isActive: false });

    // Act
    const act = auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Assert
    await expect(act).rejects.toThrow(new UnauthorizedException(LOGIN_FAILED_MESSAGE));
  });

  test('refresh ротирует токен: старый гаснет, новый работает', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    const first = await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Act
    const second = await auth.refresh(first.refreshToken, META);
    const third = await auth.refresh(second.refreshToken, META);

    // Assert
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(third.user.id).toBe(admin.id);
    const tokens = await prisma.adminRefreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(new Set(tokens.map((token) => token.familyId)).size).toBe(1);
    expect(tokens.filter((token) => token.revokedAt === null)).toHaveLength(1);
  });

  test('повторное предъявление использованного токена отзывает всё семейство', async () => {
    // Arrange: токен украли — им воспользовались дважды
    const admin = await createTestAdmin(prisma);
    const first = await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);
    const second = await auth.refresh(first.refreshToken, META);

    // Act
    const reuse = auth.refresh(first.refreshToken, META);

    // Assert
    await expect(reuse).rejects.toThrow(UnauthorizedException);
    await expect(auth.refresh(second.refreshToken, META)).rejects.toThrow(UnauthorizedException);
    const alive = await prisma.adminRefreshToken.count({ where: { revokedAt: null } });
    expect(alive).toBe(0);
  });

  test('параллельные обновления одним токеном: выигрывает одно, семейство отзывается', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    const session = await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Act
    const results = await Promise.allSettled([
      auth.refresh(session.refreshToken, META),
      auth.refresh(session.refreshToken, META),
    ]);

    // Assert
    expect(results.filter((result) => result.status === 'rejected').length).toBeGreaterThanOrEqual(1);
    expect(await prisma.adminRefreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  test('выход гасит семейство', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    const session = await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Act
    await auth.logout(session.refreshToken);

    // Assert
    await expect(auth.refresh(session.refreshToken, META)).rejects.toThrow(UnauthorizedException);
  });

  test('смена пароля гасит прежние access- и refresh-токены, выдаёт новую сессию', async () => {
    // Arrange
    const admin = await createTestAdmin(prisma);
    const old = await auth.login(admin.email, TEST_ADMIN_PASSWORD, META);

    // Act
    const fresh = await auth.changePassword(admin.id, TEST_ADMIN_PASSWORD, 'new-password-456', META);

    // Assert
    await expect(guard.authenticate(old.accessToken)).rejects.toThrow(UnauthorizedException);
    await expect(auth.refresh(old.refreshToken, META)).rejects.toThrow(UnauthorizedException);
    await expect(guard.authenticate(fresh.accessToken)).resolves.toMatchObject({ id: admin.id });
    await expect(auth.login(admin.email, 'new-password-456', META)).resolves.toBeDefined();
  });

  test('деактивация гасит access-токен сразу, не через 15 минут', async () => {
    // Arrange
    const owner = await createTestAdmin(prisma, { email: 'owner@example.test' });
    const editor = await createTestAdmin(prisma, { email: 'editor@example.test', role: AdminRole.EDITOR });
    const session = await auth.login(editor.email, TEST_ADMIN_PASSWORD, META);

    // Act
    await users.update(editor.id, { isActive: false }, principal(owner), META);

    // Assert
    await expect(guard.authenticate(session.accessToken)).rejects.toThrow(UnauthorizedException);
    await expect(auth.refresh(session.refreshToken, META)).rejects.toThrow(UnauthorizedException);
  });

  test('смена роли вступает в силу на следующем же запросе', async () => {
    // Arrange
    const owner = await createTestAdmin(prisma, { email: 'owner@example.test' });
    const editor = await createTestAdmin(prisma, { email: 'editor@example.test', role: AdminRole.EDITOR });
    const session = await auth.login(editor.email, TEST_ADMIN_PASSWORD, META);

    // Act
    await users.update(editor.id, { role: AdminRole.ACCOUNTANT }, principal(owner), META);
    const relogin = await auth.login(editor.email, TEST_ADMIN_PASSWORD, META);

    // Assert
    await expect(guard.authenticate(session.accessToken)).rejects.toThrow(UnauthorizedException);
    await expect(guard.authenticate(relogin.accessToken)).resolves.toMatchObject({ role: AdminRole.ACCOUNTANT });
  });

  test('последнего активного суперадмина нельзя понизить или отключить', async () => {
    // Arrange
    const owner = await createTestAdmin(prisma, { email: 'owner@example.test' });
    const second = await createTestAdmin(prisma, { email: 'second@example.test' });
    await users.update(second.id, { isActive: false }, principal(owner), META);

    // Act: второй суперадмин пытается снять первого — но второй уже неактивен
    const demote = users.update(owner.id, { role: AdminRole.EDITOR }, principal(second), META);

    // Assert
    await expect(demote).rejects.toThrow(ConflictException);
  });

  test('при двух активных суперадминах одного понизить можно — и это видно в журнале', async () => {
    // Arrange
    const owner = await createTestAdmin(prisma, { email: 'owner@example.test' });
    const second = await createTestAdmin(prisma, { email: 'second@example.test' });

    // Act
    const updated = await users.update(second.id, { role: AdminRole.EDITOR }, principal(owner), META);

    // Assert
    expect(updated.role).toBe(AdminRole.EDITOR);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'admin_user.update' } });
    expect(entry.before).toEqual({ role: AdminRole.SUPER_ADMIN });
    expect(entry.after).toEqual({ role: AdminRole.EDITOR });
    expect(entry.actorId).toBe(owner.id);
  });

  test('повторный e-mail — 409', async () => {
    // Arrange
    const owner = await createTestAdmin(prisma, { email: 'owner@example.test' });

    // Act
    const act = users.create(
      { email: 'owner@example.test', password: 'long-enough-pass', role: AdminRole.EDITOR },
      principal(owner),
      META,
    );

    // Assert
    await expect(act).rejects.toThrow(ConflictException);
  });

  function principal(user: { id: string; email: string; role: AdminRole }): AdminPrincipal {
    return { id: user.id, email: user.email, role: user.role, displayName: null };
  }
});
