import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { diffSnapshots } from './audit-snapshot';
import type { JsonObject } from './audit-snapshot';
import type { AuditEntry } from './audit.types';

type Db = PrismaService | Prisma.TransactionClient;

function toDbJson(value: JsonObject | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/**
 * Запись в журнал действий.
 *
 * Первый аргумент — транзакция изменения: запись журнала коммитится вместе
 * с правкой или откатывается вместе с ней. `undefined` — только для событий
 * без изменения данных (вход, экспорт), им транзакция не нужна.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient | undefined, entry: AuditEntry): Promise<void> {
    const db: Db = tx ?? this.prisma;
    const diff = diffSnapshots(entry.before, entry.after, entry.snapshot);

    await db.auditLog.create({
      data: {
        actorType: entry.actor.type,
        actorId: entry.actor.type === 'user' ? entry.actor.id : null,
        actorRole: entry.actor.type === 'user' ? entry.actor.role : null,
        actorLabel: entry.actor.label,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toDbJson(diff.before),
        after: toDbJson(diff.after),
        ip: entry.meta?.ip ?? null,
        userAgent: entry.meta?.userAgent ?? null,
      },
    });
  }
}
