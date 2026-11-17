import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DONOR_AUTH_OPTIONS, DONOR_MAIL } from '../recurring-contract/contract';
import type {
  DonorAuthOptions, DonorIdentityResolver, DonorMailSender, DonorSessionView,
  EmailCodeRequested, VerifiedDonorIdentity, VerifiedEmailSession,
} from '../recurring-contract/contract';
import { codeHash, codeMatches, generateCode, generateSessionToken, normalizeEmail, tokenHash } from './donor-auth.crypto';
import { authRequired, donorError, invalidCode, mailUnavailable } from './donor-auth.errors';
import { DonorIpLimiter } from './donor-ip-limiter';

const CODE_TTL_MS = 600_000;
const SESSION_TTL_MS = 2_592_000_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class DonorAuthService implements DonorIdentityResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: DonorIpLimiter,
    @Optional() @Inject(DONOR_AUTH_OPTIONS) private readonly options?: DonorAuthOptions,
    @Optional() @Inject(DONOR_MAIL) private readonly mail?: DonorMailSender,
  ) {}

  async requestCode(input: string, ip: string): Promise<EmailCodeRequested> {
    const { secret, mail } = this.available();
    const email = normalizeEmail(input);
    this.limiter.take('send', ip);
    const id = randomUUID();
    const code = generateCode();
    const limited = await this.prisma.$transaction(async tx => {
      await this.lockEmail(tx, email);
      const now = new Date();
      // Rows also serve as persisted send counters: retention MUST be at least one hour,
      // including expired/consumed/SMTP-failed challenges.
      const recent = await tx.donorEmailChallenge.findMany({
        where: { emailNormalized: email, createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
        orderBy: { createdAt: 'desc' }, take: 5, select: { createdAt: true },
      });
      const fifth = recent[4];
      if (fifth) return Math.max(1, Math.ceil((fifth.createdAt.getTime() + 3_600_000 - now.getTime()) / 1000));
      if (recent[0] && recent[0].createdAt.getTime() + 60_000 > now.getTime()) {
        return Math.ceil((recent[0].createdAt.getTime() + 60_000 - now.getTime()) / 1000);
      }
      await tx.donorEmailChallenge.updateMany({
        where: { emailNormalized: email, consumedAt: null }, data: { consumedAt: now },
      });
      await tx.donorEmailChallenge.create({ data: {
        id, emailNormalized: email, codeHash: codeHash(secret, id, email, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS), createdAt: now,
      } });
      return 0;
    }, { isolationLevel: 'ReadCommitted' });
    if (limited) throw donorError(429, 'RATE_LIMITED', 'Повторите попытку позже', limited);
    try {
      await mail.sendCode({ to: email, code, expiresInSeconds: 600 });
    } catch {
      // Keep the persisted send counter, invalidate only this failed delivery. No provider error/PII logs.
      await this.prisma.donorEmailChallenge.updateMany({
        where: { id, consumedAt: null }, data: { consumedAt: new Date() },
      });
      throw mailUnavailable();
    }
    return { accepted: true, challengeId: id, expiresInSeconds: 600, retryAfterSeconds: 60 };
  }

  async verify(challengeId: string, code: string, ip: string): Promise<VerifiedEmailSession> {
    const { secret } = this.available();
    this.limiter.take('verify', ip);
    if (!UUID_V4.test(challengeId) || !/^[0-9]{6}$/.test(code)) throw invalidCode();
    // Immutable address lookup only. Re-read the challenge under BOTH locks before deciding.
    const target = await this.prisma.donorEmailChallenge.findUnique({ where: { id: challengeId }, select: { emailNormalized: true } });
    if (!target) throw invalidCode();
    const result = await this.prisma.$transaction(async tx => {
      await this.lockEmail(tx, target.emailNormalized);
      await tx.$queryRaw`SELECT id FROM donor_email_challenge WHERE id = ${challengeId}::uuid FOR UPDATE`;
      const stored = await tx.donorEmailChallenge.findUnique({ where: { id: challengeId } });
      const now = new Date();
      if (!stored || stored.consumedAt || stored.expiresAt <= now || stored.failedAttempts >= 5) return null;
      if (!codeMatches(stored.codeHash, codeHash(secret, stored.id, stored.emailNormalized, code))) {
        await tx.donorEmailChallenge.update({ where: { id: stored.id }, data: { failedAttempts: { increment: 1 } } });
        // Return instead of throwing: failedAttempts MUST commit.
        return null;
      }
      const consumed = await tx.donorEmailChallenge.updateMany({
        where: { id: stored.id, consumedAt: null, expiresAt: { gt: now }, failedAttempts: { lt: 5 } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      const donor = await tx.donorIdentity.upsert({
        where: { emailNormalized: stored.emailNormalized }, update: {},
        create: { emailNormalized: stored.emailNormalized, emailVerifiedAt: now },
      });
      const sessionToken = generateSessionToken();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      await tx.donorSession.create({ data: { donorId: donor.id, tokenHash: tokenHash(sessionToken), expiresAt } });
      return { sessionToken, donor: { id: donor.id, email: donor.emailNormalized, emailVerifiedAt: donor.emailVerifiedAt.toISOString() }, expiresAt: expiresAt.toISOString() };
    }, { isolationLevel: 'ReadCommitted' });
    if (!result) throw invalidCode();
    return result;
  }

  async requireSession(rawToken: string): Promise<VerifiedDonorIdentity> {
    const session = await this.readSession(rawToken);
    return { donorId: session.donorId, sessionId: session.id, emailVerifiedAt: session.donor.emailVerifiedAt };
  }

  async session(rawToken: string): Promise<DonorSessionView> {
    const session = await this.readSession(rawToken);
    return {
      donor: { id: session.donorId, email: session.donor.emailNormalized, emailVerifiedAt: session.donor.emailVerifiedAt.toISOString() },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async logout(rawToken: string | null): Promise<void> {
    if (!rawToken || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return;
    await this.prisma.donorSession.updateMany({ where: { tokenHash: tokenHash(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async readSession(rawToken: string) {
    if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw authRequired();
    const session = await this.prisma.donorSession.findUnique({
      where: { tokenHash: tokenHash(rawToken) },
      include: { donor: { select: { emailNormalized: true, emailVerifiedAt: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.donor.emailVerifiedAt) throw authRequired();
    return session;
  }

  private available(): { secret: string; mail: DonorMailSender } {
    if (!this.options || Buffer.byteLength(this.options.codeHmacSecret ?? '', 'utf8') < 32
      || this.options.sessionTtlMs !== SESSION_TTL_MS || !this.mail) throw mailUnavailable();
    return { secret: this.options.codeHmacSecret, mail: this.mail };
  }

  private async lockEmail(tx: Prisma.TransactionClient, email: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`donor-email:${email}`}, 0))`;
  }
}
