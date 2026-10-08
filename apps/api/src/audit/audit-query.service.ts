import { Injectable } from '@nestjs/common';

import type { Page } from '../common/pagination';
import { pageArgs } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { AdminRole } from '../generated/prisma/enums';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface AuditLogItemResponse {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: {
    readonly type: string;
    readonly id: string | null;
    readonly role: AdminRole | null;
    readonly label: string | null;
  };
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

const WILDCARD_SUFFIX = '.*';

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto): Promise<Page<AuditLogItemResponse>> {
    const where = buildWhere(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actor: { type: row.actorType, id: row.actorId, role: row.actorRole, label: row.actorLabel },
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        userAgent: row.userAgent,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

function buildWhere(query: AuditQueryDto): Prisma.AuditLogWhereInput {
  const action =
    query.action === undefined
      ? undefined
      : query.action.endsWith(WILDCARD_SUFFIX)
        ? { startsWith: query.action.slice(0, -1) }
        : query.action;

  return {
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(action === undefined ? {} : { action }),
    ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          occurredAt: {
            ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
            ...(query.to === undefined ? {} : { lt: new Date(query.to) }),
          },
        }),
  };
}
