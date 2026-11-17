import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { donorError } from '../../donor-auth/donor-auth.errors';
import type { Prisma } from '../../generated/prisma/client';
import type { SubscriptionView, HistoryItem } from '../../recurring-contract/contract';
import { keyHash } from './recurring.service';

const include = { firstDonation: true, attempts: { orderBy: { period: 'desc' as const }, take: 1 } };
type Sub = Prisma.RecurringSubscriptionGetPayload<{ include: typeof include }>;
function view(sub: Sub): SubscriptionView {
  return { id: sub.id, amountKopecks: sub.firstDonation.amountKopecks.toString(),
    frequency: sub.frequency as SubscriptionView['frequency'], state: sub.state as SubscriptionView['state'],
    termsVersion: sub.termsVersion, consentedAt: sub.consentedAt.toISOString(), consentVerified: !!sub.consentVerifiedAt,
    nextAt: sub.nextAt?.toISOString() ?? null, createdAt: sub.createdAt.toISOString(), cancelledAt: sub.cancelledAt?.toISOString() ?? null,
    firstPayment: sub.firstDonation.status, latestAttempt: sub.attempts[0] ? {
      period: sub.attempts[0].period, state: sub.attempts[0].state as NonNullable<SubscriptionView['latestAttempt']>['state'],
    } : null };
}
function pagination(cursor?: string, rawLimit?: string, history = false) {
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (rawLimit !== undefined && !/^\d+$/.test(rawLimit))) throw donorError(400, 'VALIDATION_ERROR', 'Неверный размер страницы');
  let after: { createdAt: Date; id: string } | undefined;
  if (cursor !== undefined) {
    try {
      if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw Error();
      const json = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Record<string, unknown>;
      const id = json[history ? 'orderId' : 'id'];
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof json.createdAt !== 'string' || !Number.isFinite(Date.parse(json.createdAt))) throw Error();
      after = { id, createdAt: new Date(json.createdAt) };
    } catch { throw donorError(400, 'VALIDATION_ERROR', 'Неверный курсор'); }
  }
  return { limit, after };
}
const missing = () => donorError(404, 'NOT_FOUND', 'Подписка не найдена');

@Injectable()
export class RecurringManagementService {
  constructor(private readonly prisma: PrismaService) {}
  async list(ownerId: string, cursor?: string, rawLimit?: string) {
    const { limit, after } = pagination(cursor, rawLimit);
    const rows = await this.prisma.recurringSubscription.findMany({ where: { ownerId,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, include });
    const items = rows.slice(0, limit); const last = items.at(-1);
    return { items: items.map(view), nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
  }
  async detail(ownerId: string, id: string) {
    const sub = await this.prisma.recurringSubscription.findFirst({ where: { id, ownerId }, include });
    if (!sub) throw missing(); return view(sub);
  }
  async history(ownerId: string, id: string, cursor?: string, rawLimit?: string) {
    const { limit, after } = pagination(cursor, rawLimit, true);
    const sub = await this.prisma.recurringSubscription.findFirst({ where: { id, ownerId }, select: { firstDonationId: true } });
    if (!sub) throw missing();
    const rows = await this.prisma.donation.findMany({ where: {
      OR: [{ id: sub.firstDonationId }, { recurringAttempt: { subscriptionId: id } }],
      ...(after ? { AND: [{ OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }] } : {}),
    }, include: { recurringAttempt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
    const items = rows.slice(0, limit); const last = items.at(-1);
    return { items: items.map((d): HistoryItem => ({ orderId: d.id, kind: d.id === sub.firstDonationId ? 'first' : 'repeat',
      period: d.recurringAttempt?.period ?? null, scheduledAt: d.recurringAttempt?.scheduledAt.toISOString() ?? null,
      status: d.status, operationState: (d.recurringAttempt?.state ?? null) as HistoryItem['operationState'],
      amountKopecks: d.amountKopecks.toString(), paidAmountKopecks: d.paidAmountKopecks?.toString() ?? null, paidAt: d.paidAt?.toISOString() ?? null,
    })), nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), orderId: last.id })).toString('base64url') : null };
  }
  async cancel(ownerId: string, id: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM recurring_subscription WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid FOR UPDATE`;
      const sub = await tx.recurringSubscription.findFirst({ where: { id, ownerId } });
      if (!sub) throw missing();
      return view(await tx.recurringSubscription.update({ where: { id }, data: { state: 'cancelled', nextAt: null,
        cancelledAt: sub.cancelledAt ?? new Date() }, include }));
    }, { timeout: 12000 });
  }
  async claim(ownerId: string, key: string) {
    return this.prisma.$transaction(async tx => {
      const hash = keyHash(key);
      await tx.$queryRaw`SELECT id FROM recurring_subscription WHERE key_hash=${hash} FOR UPDATE`;
      const sub = await tx.recurringSubscription.findUnique({ where: { keyHash: hash }, include });
      if (!sub) throw missing();
      if (sub.ownerId && sub.ownerId !== ownerId) throw donorError(409, 'LEGACY_ALREADY_CLAIMED', 'Доступ уже присоединён');
      const claimed = sub.ownerId === null;
      const result = claimed ? await tx.recurringSubscription.update({ where: { id: sub.id }, data: { ownerId, legacyClaimedAt: new Date() }, include }) : sub;
      return { subscription: view(result), claimed };
    });
  }
}
