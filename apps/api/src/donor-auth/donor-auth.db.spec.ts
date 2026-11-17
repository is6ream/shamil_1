import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service';
import { PrismaService as PrismaProvider } from '../database/prisma.service';
import { createTestPrismaService, describeDatabase } from '../database/testing/test-database';
import { DONOR_AUTH_OPTIONS, DONOR_MAIL } from '../recurring-contract/contract';
import { codeHash, tokenHash } from './donor-auth.crypto';
import { DonorAuthService } from './donor-auth.service';
import { DonorIpLimiter } from './donor-ip-limiter';

/** Run ONLY after verifying dedicated TEST_DATABASE_URL and applying foundation to that test DB.
 * Not part of the isolated run: actual PostgreSQL locks/rollback cannot be proven by mocks.
 * Own fixtures only; no TRUNCATE or edits to the integrator's shared resetDatabase.
 */
describeDatabase('donor auth PostgreSQL concurrency and rollback', () => {
  let prisma: PrismaService;
  let auth: DonorAuthService;
  let prefix: string;
  const secret = 'synthetic-donor-db-test-hmac-secret-only';
  const mail = { sendCode: jest.fn<Promise<void>, [{ to: string; code: string; expiresInSeconds: 600 }]>() };

  beforeAll(() => { prisma = createTestPrismaService(); });
  beforeEach(async () => {
    prefix = `auth-${randomUUID()}`;
    mail.sendCode.mockReset().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({ providers: [
      DonorAuthService, DonorIpLimiter, { provide: PrismaProvider, useValue: prisma },
      { provide: DONOR_AUTH_OPTIONS, useValue: { codeHmacSecret: secret, sessionTtlMs: 2_592_000_000 } },
      { provide: DONOR_MAIL, useValue: mail },
    ] }).compile();
    auth = module.get(DonorAuthService);
  });
  afterEach(async () => {
    const donors = await prisma.donorIdentity.findMany({ where: { emailNormalized: { startsWith: prefix } }, select: { id: true } });
    await prisma.donorSession.deleteMany({ where: { donorId: { in: donors.map(donor => donor.id) } } });
    await prisma.donorIdentity.deleteMany({ where: { id: { in: donors.map(donor => donor.id) } } });
    await prisma.donorEmailChallenge.deleteMany({ where: { emailNormalized: { startsWith: prefix } } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  const address = () => `${prefix}@example.test`;
  async function issue() {
    const reply = await auth.requestCode(address(), 'ip1');
    const message = mail.sendCode.mock.calls.at(-1)?.[0];
    if (!message) throw new Error('Test mail transport received no code');
    return { id: reply.challengeId, code: message.code };
  }

  it('serializes concurrent sends by normalized address, persisting one send', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      auth.requestCode(index % 2 ? address().toUpperCase() : address(), `ip${index}`)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.donorEmailChallenge.count({ where: { emailNormalized: address() } })).toBe(1);
    expect(mail.sendCode).toHaveBeenCalledTimes(1);
  });

  it('allows exactly one concurrent consume and one independent session', async () => {
    const issued = await issue();
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => auth.verify(issued.id, issued.code, `ip${index}`)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const donor = await prisma.donorIdentity.findUniqueOrThrow({ where: { emailNormalized: address() } });
    expect(await prisma.donorSession.count({ where: { donorId: donor.id } })).toBe(1);
    await expect(auth.verify(issued.id, issued.code, 'repeat-ip')).rejects.toMatchObject({ status: 401 });
  });

  it('persists exactly five wrong attempts under contention, preventing a later correct code', async () => {
    const issued = await issue();
    const wrong = issued.code === '000000' ? '111111' : '000000';
    await Promise.allSettled(Array.from({ length: 12 }, (_, index) => auth.verify(issued.id, wrong, `ip${index}`)));
    expect((await prisma.donorEmailChallenge.findUniqueOrThrow({ where: { id: issued.id } })).failedAttempts).toBe(5);
    await expect(auth.verify(issued.id, issued.code, 'correct-ip')).rejects.toMatchObject({ status: 401 });
    expect(await prisma.donorIdentity.count({ where: { emailNormalized: address() } })).toBe(0);
  });

  it('new send invalidates old challenge, and hourly count includes consumed challenges', async () => {
    const issued = await issue();
    await prisma.donorEmailChallenge.update({ where: { id: issued.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
    const second = await issue();
    await expect(auth.verify(issued.id, issued.code, 'ip1')).rejects.toMatchObject({ status: 401 });
    expect(await prisma.donorEmailChallenge.count({ where: { emailNormalized: address() } })).toBe(2);
    const result = await auth.verify(second.id, second.code, 'ip1');
    expect(result.donor.email).toBe(address());
  });

  it('rejects exact expiry and persists hourly send caps independently of resend time', async () => {
    const issued = await issue();
    await prisma.donorEmailChallenge.update({ where: { id: issued.id }, data: { createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() - 1) } });
    await expect(auth.verify(issued.id, issued.code, 'ip1')).rejects.toMatchObject({ status: 401 });
    for (let index = 0; index < 4; index++) {
      const id = randomUUID();
      await prisma.donorEmailChallenge.create({ data: {
        id, emailNormalized: address(), codeHash: codeHash(secret, id, address(), '000000'),
        createdAt: new Date(Date.now() - 120_000 - index * 60_000), expiresAt: new Date(Date.now() + 60_000),
      } });
    }
    await expect(auth.requestCode(address(), 'ip2')).rejects.toMatchObject({ status: 429 });
  });

  it('sessions are independent, hash-only, absolute, and revocation is immediate', async () => {
    const first = await issue();
    const session1 = await auth.verify(first.id, first.code, 'ip1');
    await prisma.donorEmailChallenge.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
    const second = await issue();
    const session2 = await auth.verify(second.id, second.code, 'ip2');
    expect(session1.donor.id).toBe(session2.donor.id);
    expect(session1.sessionToken).not.toBe(session2.sessionToken);
    const persisted = await prisma.donorSession.findUniqueOrThrow({ where: { tokenHash: tokenHash(session1.sessionToken) } });
    await auth.session(session1.sessionToken);
    expect((await prisma.donorSession.findUniqueOrThrow({ where: { id: persisted.id } })).expiresAt).toEqual(persisted.expiresAt);
    await auth.logout(session1.sessionToken);
    await auth.logout(session1.sessionToken);
    await expect(auth.requireSession(session1.sessionToken)).rejects.toMatchObject({ status: 401 });
    await expect(auth.requireSession(session2.sessionToken)).resolves.toMatchObject({ donorId: session2.donor.id });
  });

  it('rolls back consume and new identity if session insertion fails', async () => {
    const issued = await issue();
    // Intercept the real transaction's last write; PostgreSQL still performs the rollback.
    const extended = prisma.$extends({ query: { donorSession: { create() { throw new Error('synthetic session write failure'); } } } });
    const module = await Test.createTestingModule({ providers: [
      DonorAuthService, DonorIpLimiter, { provide: PrismaProvider, useValue: extended },
      { provide: DONOR_AUTH_OPTIONS, useValue: { codeHmacSecret: secret, sessionTtlMs: 2_592_000_000 } },
      { provide: DONOR_MAIL, useValue: mail },
    ] }).compile();
    await expect(module.get(DonorAuthService).verify(issued.id, issued.code, 'ip1')).rejects.toThrow('synthetic session write failure');
    expect((await prisma.donorEmailChallenge.findUniqueOrThrow({ where: { id: issued.id } })).consumedAt).toBeNull();
    expect(await prisma.donorIdentity.count({ where: { emailNormalized: address() } })).toBe(0);
    await expect(auth.verify(issued.id, issued.code, 'ip2')).resolves.toHaveProperty('sessionToken');
  });
});
