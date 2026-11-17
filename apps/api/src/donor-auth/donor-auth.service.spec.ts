import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DONOR_AUTH_OPTIONS, DONOR_MAIL } from '../recurring-contract/contract';
import { codeHash, codeMatches, generateCode, generateSessionToken, normalizeEmail, tokenHash } from './donor-auth.crypto';
import { DonorAuthService } from './donor-auth.service';
import { DonorIpLimiter } from './donor-ip-limiter';

const secret = 'synthetic-donor-hmac-secret-only-for-tests';
const now = new Date('2026-11-14T10:00:00Z');
const email = 'donor@example.test';
const code = '004210';
const id = randomUUID();
const donor = { id: randomUUID(), emailNormalized: email, emailVerifiedAt: now };
const challenge = () => ({ id, emailNormalized: email, codeHash: codeHash(secret, id, email, code), expiresAt: new Date(+now + 600_000), consumedAt: null as Date | null, failedAttempts: 0, createdAt: now });

describe('DonorAuthService (isolated, no database/mail/network)', () => {
  let auth: DonorAuthService;
  const mail = { sendCode: jest.fn().mockResolvedValue(undefined) };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([{ id }]),
    donorEmailChallenge: {
      findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    donorIdentity: { upsert: jest.fn() },
    donorSession: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn() };

  beforeEach(async () => {
    jest.useFakeTimers({ now });
    jest.clearAllMocks();
    tx.donorEmailChallenge.findMany.mockResolvedValue([]);
    tx.donorEmailChallenge.findUnique.mockResolvedValue(challenge());
    tx.donorEmailChallenge.updateMany.mockResolvedValue({ count: 1 });
    tx.donorEmailChallenge.update.mockResolvedValue({});
    tx.donorEmailChallenge.create.mockResolvedValue({});
    tx.donorIdentity.upsert.mockResolvedValue(donor);
    tx.donorSession.create.mockResolvedValue({});
    tx.donorSession.updateMany.mockResolvedValue({ count: 1 });
    mail.sendCode.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation((fn: (client: Prisma.TransactionClient) => Promise<unknown>) => fn(tx as unknown as Prisma.TransactionClient));
    const module = await Test.createTestingModule({ providers: [
      DonorAuthService, DonorIpLimiter,
      { provide: PrismaService, useValue: prisma }, { provide: DONOR_MAIL, useValue: mail },
      { provide: DONOR_AUTH_OPTIONS, useValue: { codeHmacSecret: secret, sessionTtlMs: 2_592_000_000 } },
    ] }).compile();
    auth = module.get(DonorAuthService);
  });
  afterEach(() => jest.useRealTimers());

  it('normalizes only ASCII trim/lowercase, preserving dots and plus', () => {
    expect(normalizeEmail(' A.B+Tag@Example.Test ')).toBe('a.b+tag@example.test');
    for (const value of ['я@example.test', 'a@пример.рф', 'a\r\n@example.test', 'invalid']) expect(() => normalizeEmail(value)).toThrow();
    expect(generateCode()).toMatch(/^\d{6}$/);
    expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeMatches(codeHash(secret, id, email, code), codeHash(secret, id, email, code))).toBe(true);
    expect(codeMatches('bad', 'bad')).toBe(false);
    expect(codeHash(secret, id, email, code)).not.toBe(codeHash(secret, randomUUID(), email, code));
  });

  it('persists HMAC, invalidates earlier codes, sends using injected transport, exposes no code', async () => {
    const reply = await auth.requestCode(' Donor@Example.Test ', 'ip1');
    expect(reply).toEqual({ accepted: true, challengeId: expect.any(String), expiresInSeconds: 600, retryAfterSeconds: 60 });
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.anything(), `donor-email:${email}`);
    expect(tx.donorEmailChallenge.updateMany).toHaveBeenCalledWith({ where: { emailNormalized: email, consumedAt: null }, data: { consumedAt: now } });
    const message = mail.sendCode.mock.calls[0]?.[0] as { to: string; code: string };
    const stored = tx.donorEmailChallenge.create.mock.calls[0]?.[0] as { data: { id: string; codeHash: string; expiresAt: Date } };
    expect(message.to).toBe(email);
    expect(stored.data.codeHash).toBe(codeHash(secret, reply.challengeId, email, message.code));
    expect(stored.data.expiresAt).toEqual(new Date(+now + 600_000));
    expect(tx.donorIdentity.upsert).not.toHaveBeenCalled();
    expect(reply).not.toHaveProperty('code');
  });

  it.each([1, 5])('enforces persisted address resend/hourly limit (%s records)', async count => {
    tx.donorEmailChallenge.findMany.mockResolvedValue(Array.from({ length: count }, () => ({ createdAt: now })));
    await expect(auth.requestCode(email, 'ip1')).rejects.toMatchObject({ response: { error: { code: 'RATE_LIMITED' } } });
    expect(tx.donorEmailChallenge.create).not.toHaveBeenCalled();
    expect(mail.sendCode).not.toHaveBeenCalled();
  });

  it('invalidates failed SMTP delivery, retains persisted send count, sanitizes provider errors', async () => {
    mail.sendCode.mockRejectedValue(new Error('private SMTP response'));
    await expect(auth.requestCode(email, 'ip1')).rejects.toMatchObject({ response: { error: { code: 'EMAIL_UNAVAILABLE' } } });
    expect(tx.donorEmailChallenge.updateMany).toHaveBeenLastCalledWith({ where: { id: expect.any(String), consumedAt: null }, data: { consumedAt: now } });
  });

  it('persists a wrong attempt before returning a uniform error (no transaction throw)', async () => {
    await expect(auth.verify(id, '111111', 'ip1')).rejects.toMatchObject({ response: { error: { code: 'EMAIL_CODE_INVALID' } } });
    await expect(prisma.$transaction.mock.results[0]?.value).resolves.toBeNull();
    expect(tx.donorEmailChallenge.update).toHaveBeenCalledWith({ where: { id }, data: { failedAttempts: { increment: 1 } } });
    expect(tx.donorSession.create).not.toHaveBeenCalled();
  });

  it.each(['expired', 'consumed', 'exhausted', 'unknown'])('rejects %s challenge identically', async kind => {
    const stored = challenge();
    if (kind === 'expired') stored.expiresAt = now;
    if (kind === 'consumed') stored.consumedAt = now;
    if (kind === 'exhausted') stored.failedAttempts = 5;
    tx.donorEmailChallenge.findUnique.mockResolvedValue(kind === 'unknown' ? null : stored);
    await expect(auth.verify(id, code, 'ip1')).rejects.toMatchObject({ response: { error: { code: 'EMAIL_CODE_INVALID' } } });
    expect(tx.donorIdentity.upsert).not.toHaveBeenCalled();
  });

  it('creates verified identity and a hashed independent absolute 30-day session atomically', async () => {
    const result = await auth.verify(id, code, 'ip1');
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toBe(new Date(+now + 2_592_000_000).toISOString());
    expect(tx.donorIdentity.upsert).toHaveBeenCalledWith({ where: { emailNormalized: email }, update: {}, create: { emailNormalized: email, emailVerifiedAt: now } });
    expect(tx.donorSession.create).toHaveBeenCalledWith({ data: { donorId: donor.id, tokenHash: tokenHash(result.sessionToken), expiresAt: new Date(result.expiresAt) } });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.donorEmailChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consumedAt: null, failedAttempts: { lt: 5 } }) }));
  });

  it('does not issue a session if conditional consume loses', async () => {
    tx.donorEmailChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(auth.verify(id, code, 'ip1')).rejects.toMatchObject({ status: 401 });
    expect(tx.donorSession.create).not.toHaveBeenCalled();
  });

  it('authenticates two devices to the same verified identity using independent challenges and sessions', async () => {
    const secondId = randomUUID();
    const secondChallenge = { ...challenge(), id: secondId, codeHash: codeHash(secret, secondId, email, code) };
    tx.donorEmailChallenge.findUnique
      .mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(secondChallenge).mockResolvedValueOnce(secondChallenge);

    const first = await auth.verify(id, code, 'device-one-ip');
    const second = await auth.verify(secondId, code, 'device-two-ip');

    expect(first.donor.id).toBe(second.donor.id);
    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(tx.donorIdentity.upsert).toHaveBeenNthCalledWith(2, {
      where: { emailNormalized: email }, update: {}, create: { emailNormalized: email, emailVerifiedAt: now },
    });
    expect(tx.donorSession.create).toHaveBeenCalledTimes(2);
    expect(Object.keys(first).sort()).toEqual(['donor', 'expiresAt', 'sessionToken']);
    expect(Object.keys(second).sort()).toEqual(['donor', 'expiresAt', 'sessionToken']);
  });

  it('takes address lock before challenge row lock and re-reads the protected row', async () => {
    await auth.verify(id, code, 'ip1');
    const addressLockOrder = tx.$executeRaw.mock.invocationCallOrder[0] ?? 0;
    const rowLockOrder = tx.$queryRaw.mock.invocationCallOrder[0] ?? 0;
    const rereadOrder = tx.donorEmailChallenge.findUnique.mock.invocationCallOrder[1] ?? 0;
    expect(addressLockOrder).toBeGreaterThan(0);
    expect(rowLockOrder).toBeGreaterThan(addressLockOrder);
    expect(rereadOrder).toBeGreaterThan(rowLockOrder);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'ReadCommitted' });
  });

  it.each([
    { codeHmacSecret: 'too-short', sessionTtlMs: 2_592_000_000 },
    { codeHmacSecret: secret, sessionTtlMs: 60_000 },
  ])('fails closed with invalid injected options', async options => {
    const module = await Test.createTestingModule({ providers: [DonorAuthService, DonorIpLimiter,
      { provide: PrismaService, useValue: prisma }, { provide: DONOR_MAIL, useValue: mail },
      { provide: DONOR_AUTH_OPTIONS, useValue: options },
    ] }).compile();
    await expect(module.get(DonorAuthService).requestCode(email, 'ip1')).rejects.toMatchObject({ status: 503 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['missing', 'expired', 'revoked', 'unverified'])('rejects %s session', async kind => {
    tx.donorSession.findUnique.mockResolvedValue(kind === 'missing' ? null : {
      id: randomUUID(), donorId: donor.id, donor: { ...donor, emailVerifiedAt: kind === 'unverified' ? null : now },
      expiresAt: new Date(+now + (kind === 'expired' ? 0 : 1000)), revokedAt: kind === 'revoked' ? now : null,
    });
    await expect(auth.requireSession(generateSessionToken())).rejects.toMatchObject({ response: { error: { code: 'AUTH_REQUIRED' } } });
  });

  it('reads principal/view without renewing or exposing token/hash and revokes only current session', async () => {
    const token = generateSessionToken();
    const sessionId = randomUUID();
    tx.donorSession.findUnique.mockResolvedValue({ id: sessionId, donorId: donor.id, donor, expiresAt: new Date(+now + 1000), revokedAt: null });
    expect(await auth.requireSession(token)).toEqual({ donorId: donor.id, sessionId, emailVerifiedAt: now });
    expect(await auth.session(token)).toEqual({ donor: { id: donor.id, email, emailVerifiedAt: now.toISOString() }, expiresAt: new Date(+now + 1000).toISOString() });
    expect(tx.donorSession.updateMany).not.toHaveBeenCalled();
    await auth.logout(token);
    await auth.logout(token);
    await auth.logout(null);
    await auth.logout('admin.jwt.token');
    expect(tx.donorSession.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.donorSession.updateMany).toHaveBeenLastCalledWith({ where: { tokenHash: tokenHash(token), revokedAt: null }, data: { revokedAt: now } });
  });

  it('fails closed without mail/HMAC but existing sessions/logout do not require mail', async () => {
    const module = await Test.createTestingModule({ providers: [DonorAuthService, DonorIpLimiter, { provide: PrismaService, useValue: prisma }] }).compile();
    const unavailable = module.get(DonorAuthService);
    await expect(unavailable.requestCode(email, 'ip1')).rejects.toMatchObject({ status: 503 });
    await expect(unavailable.verify(id, code, 'ip1')).rejects.toMatchObject({ status: 503 });
    await expect(unavailable.logout(null)).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('DonorIpLimiter synchronous reservations', () => {
  it.each([['send', 10, 3_600_000], ['verify', 20, 600_000]] as const)('%s limits concurrent calls and resets after its window', async (action, maximum, windowMs) => {
    const limiter = new DonorIpLimiter();
    const results = await Promise.allSettled(Array.from({ length: maximum + 7 }, async () => limiter.take(action, 'same-ip', +now)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(maximum);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(7);
    expect(() => limiter.take(action, 'different-ip', +now)).not.toThrow();
    expect(() => limiter.take(action, 'same-ip', +now + windowMs)).not.toThrow();
  });
});
