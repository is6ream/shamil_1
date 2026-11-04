import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig, DonorConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import {
  createPendingDonation,
  createTestPrismaService,
  createTestSubscription,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import type { DonorPrincipal, DonorRequestMeta } from '../donor-auth/donor-auth.types';
import { DonorCodeService } from '../donor-auth/donor-code.service';
import { DonorSessionService } from '../donor-auth/donor-session.service';
import { DonorTokenService } from '../donor-auth/donor-token.service';
import { DonorDonationsService } from '../donor-donations/donor-donations.service';
import { DonationStatus, SubscriptionStatus } from '../generated/prisma/enums';
import { LogMailSender } from '../mail/log-mail.sender';
import { createSubscriptionHarness } from '../subscriptions/testing/subscription-harness';
import { DonorProfileService } from './donor-profile.service';

const DONOR: DonorConfig = {
  enabled: true,
  jwtSecret: 'donor-jwt-secret-'.padEnd(48, 'd'),
  hmacSecret: 'donor-hmac-secret-'.padEnd(48, 'h'),
  cookieSecure: false,
  vk: null,
};
const META: DonorRequestMeta = { ip: '203.0.113.7', userAgent: 'jest' };
const EMAIL = 'ivan@example.test';
const NOW = new Date('2026-10-27T10:00:00.000Z');

function lastCode(mail: LogMailSender): string {
  const match = /(\d{6})/.exec(mail.outbox().at(-1)?.subject ?? '');

  if (match?.[1] === undefined) {
    throw new Error('Письма с кодом нет');
  }

  return match[1];
}

/** Каждый тест готовит сбор, регионы, сессию и подписку: на холодной базе это дольше 5 с. */
const DB_TEST_TIMEOUT_MS = 30_000;

describeDatabase('кабинет жертвователя: профиль и «Моя помощь»', () => {
  jest.setTimeout(DB_TEST_TIMEOUT_MS);

  let prisma: PrismaService;
  let fixtures: TestFixtures;
  let mail: LogMailSender;
  let sessions: DonorSessionService;
  let profile: DonorProfileService;
  let history: DonorDonationsService;
  let donor: DonorPrincipal;

  beforeAll(() => {
    prisma = createTestPrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
    mail = new LogMailSender(false);
    const config = new ConfigService<AppConfig, true>({ donor: DONOR });
    sessions = new DonorSessionService(prisma, new DonorTokenService(config));
    const harness = createSubscriptionHarness(prisma);
    profile = new DonorProfileService(prisma, new DonorCodeService(prisma, mail, config), sessions, harness.subscriptions);
    history = new DonorDonationsService(prisma);
    const row = await prisma.donorUser.create({ data: { email: EMAIL, createdAt: new Date('2025-03-01T00:00:00Z') } });
    await sessions.open(row, META, false);
    donor = { id: row.id, sessionId: await sessionIdOf(row.id), email: EMAIL };
  });

  async function sessionIdOf(donorId: string): Promise<string> {
    return (await prisma.donorSession.findFirstOrThrow({ where: { donorId } })).id;
  }

  /** Донат жертвователя: оплачен в `paidAt` или неуспешен. */
  async function donation(
    amountKopecks: bigint,
    at: Date,
    status: DonationStatus = DonationStatus.paid,
    named = false,
  ): Promise<string> {
    const created = await createPendingDonation(prisma, fixtures, { amountKopecks });

    await prisma.donation.update({
      where: { id: created.id },
      data: { userId: donor.id, createdAt: at, ...(named ? { isAnonymous: false, donorName: 'Ильдар Х.' } : {}) },
    });

    if (status === DonationStatus.paid) {
      await markPaid(prisma, created.id, amountKopecks, at);
    } else if (status === DonationStatus.failed) {
      await prisma.donation.update({ where: { id: created.id }, data: { status: DonationStatus.failed } });
    }

    return created.id;
  }

  test('сумма за год — по часам Уфы: вечер 31 декабря остаётся в старом году', async () => {
    // Arrange: 31.12.2025 23:30 по Уфе = 18:30 UTC; 01.01.2026 00:30 по Уфе = 31.12.2025 19:30 UTC
    await donation(10_000n, new Date('2025-12-31T18:30:00Z'));
    await donation(25_000n, new Date('2025-12-31T19:30:00Z'));
    await donation(50_000n, new Date('2026-06-01T09:00:00Z'));
    await donation(70_000n, new Date('2026-06-02T09:00:00Z'), DonationStatus.failed);

    // Act
    const summary = await profile.summary(donor.id, NOW);

    // Assert
    expect(summary).toMatchObject({ year: 2026, yearTotalKopecks: '75000', donationsCount: 3, hasActiveSubscription: false });
  });

  test('история: только завершённые, по году, курсор без дублей', async () => {
    // Arrange
    for (let day = 1; day <= 5; day += 1) {
      await donation(10_000n * BigInt(day), new Date(`2026-10-0${day}T09:00:00Z`));
    }
    await createPendingDonation(prisma, fixtures).then((row) =>
      prisma.donation.update({ where: { id: row.id }, data: { userId: donor.id } }),
    );
    await donation(1_000n, new Date('2025-05-01T09:00:00Z'));

    // Act
    const first = await history.history(donor.id, { year: 2026, limit: 3 }, NOW);
    const second = await history.history(donor.id, { year: 2026, limit: 3, cursor: first.nextCursor ?? '' }, NOW);

    // Assert
    expect(first.items.map((item) => item.amountKopecks)).toEqual(['50000', '40000', '30000']);
    expect(second.items.map((item) => item.amountKopecks)).toEqual(['20000', '10000']);
    expect(second.nextCursor).toBeNull();
    expect(first.yearTotalKopecks).toBe('150000');
    expect(first.years).toEqual([2026, 2025]);
  });

  test('чужие донаты в историю не попадают', async () => {
    // Arrange
    const other = await prisma.donorUser.create({ data: { email: 'other@example.test' } });
    const created = await createPendingDonation(prisma, fixtures);
    await prisma.donation.update({ where: { id: created.id }, data: { userId: other.id } });
    await markPaid(prisma, created.id, 10_000n, new Date('2026-10-01T09:00:00Z'));

    // Act
    const result = await history.history(donor.id, { year: 2026, limit: 20 }, NOW);

    // Assert
    expect(result.items).toHaveLength(0);
  });

  test('битый курсор — 400, а не первая страница', async () => {
    await expect(history.history(donor.id, { limit: 20, cursor: 'bm90LWEtY3Vyc29y' }, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('справка: повторная заявка — та же строка; год без пожертвований — 400', async () => {
    // Arrange
    await donation(10_000n, new Date('2026-03-01T09:00:00Z'));

    // Act
    const first = await history.requestCertificate(donor.id, 2026, NOW);
    const again = await history.requestCertificate(donor.id, 2026, NOW);

    // Assert
    expect(again.id).toBe(first.id);
    expect(first.status).toBe('NEW');
    await expect(history.requestCertificate(donor.id, 2024, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(history.requestCertificate(donor.id, 2027, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  test('отзыв согласия на показ в ленте стирает подпись и в прошлых донатах', async () => {
    // Arrange
    await prisma.donorUser.update({ where: { id: donor.id }, data: { showInFeed: true } });
    const named = await donation(10_000n, new Date('2026-10-01T09:00:00Z'), DonationStatus.paid, true);

    // Act
    await profile.update(donor.id, { showInFeed: false });

    // Assert
    const row = await prisma.donation.findUniqueOrThrow({ where: { id: named } });
    expect(row).toMatchObject({ isAnonymous: true, donorName: null });
  });

  test('регион не из справочника — 400; из справочника — сохраняется со страной', async () => {
    // Act & Assert
    await expect(profile.update(donor.id, { regionSlug: 'atlantida' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const saved = await profile.update(donor.id, { regionSlug: '02', city: 'Уфа' });
    expect(saved.region).toMatchObject({ slug: '02', countryName: 'Россия' });
    expect(saved.city).toBe('Уфа');
  });

  test('смена почты: только с кодом с нового адреса; занятый адрес — 409', async () => {
    // Arrange
    await prisma.donorUser.create({ data: { email: 'taken@example.test' } });

    // Act
    await profile.requestEmailChange(donor, 'new@example.test', META);
    const changed = await profile.confirmEmailChange(donor, 'new@example.test', lastCode(mail));
    await profile.requestEmailChange({ ...donor, email: 'new@example.test' }, 'taken@example.test', META);

    // Assert
    expect(mail.outbox().at(0)?.to).toBe('new@example.test');
    expect(changed.email).toBe('new@example.test');
    await expect(
      profile.confirmEmailChange(donor, 'taken@example.test', lastCode(mail)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('VK не отвязать, если нет почты: в кабинет стало бы нечем войти', async () => {
    // Arrange
    const vkOnly = await prisma.donorUser.create({ data: { vkUserId: '777' } });

    // Act & Assert
    await expect(profile.unlinkVk(vkOnly.id)).rejects.toBeInstanceOf(ConflictException);
  });

  test('удаление: код с почты, подписки отменены, донаты без ПДн и привязки, сессии погашены', async () => {
    // Arrange
    await prisma.donorUser.update({
      where: { id: donor.id },
      data: { firstName: 'Ильдар', phoneE164: '+79171234567', showInFeed: true, regionId: fixtures.bashkortostanId },
    });
    const kept = await donation(10_000n, new Date('2026-10-01T09:00:00Z'), DonationStatus.paid, true);
    const subscription = await createTestSubscription(prisma, fixtures, donor.id, { active: true });
    await expect(profile.delete(donor, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await profile.requestDeletion(donor, META);

    // Act: время настоящее — код выдан только что
    await profile.delete(donor, lastCode(mail));

    // Assert
    const anonymized = await prisma.donorUser.findUniqueOrThrow({ where: { id: donor.id } });
    expect(anonymized).toMatchObject({ email: null, firstName: null, phoneE164: null, regionId: null, showInFeed: false });
    expect(anonymized.deletedAt).not.toBeNull();
    const row = await prisma.donation.findUniqueOrThrow({ where: { id: kept } });
    expect(row).toMatchObject({ userId: null, isAnonymous: true, donorName: null, status: DonationStatus.paid });
    const cancelled = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(cancelled.status).toBe(SubscriptionStatus.CANCELLED);
    expect(await prisma.donorSession.count({ where: { donorId: donor.id, revokedAt: null } })).toBe(0);
  });

  test('без почты удаление требует свежего входа через VK', async () => {
    // Arrange: сессия открыта 20 минут назад
    const vkOnly = await prisma.donorUser.create({ data: { vkUserId: '778' } });
    await sessions.open(vkOnly, META, false, new Date(NOW.getTime() - 20 * 60_000));
    const principal = { id: vkOnly.id, sessionId: await sessionIdOf(vkOnly.id), email: null };

    // Act & Assert
    expect(await profile.requestDeletion(principal, META)).toEqual({ method: 'fresh_login' });
    await expect(profile.delete(principal, undefined, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
