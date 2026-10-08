import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { AdminRole } from '../generated/prisma/enums';
import type { AdminPrincipal, RequestMeta } from './auth.types';
import type { CreateAdminUserDto, ResetPasswordDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { isUniqueViolation } from '../database/prisma-errors';

export interface AdminUserResponse {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly displayName: string | null;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  /** Вход заблокирован до этого момента после серии неудач; `null` — не заблокирован. */
  readonly lockedUntil: string | null;
  readonly createdAt: string;
}

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  displayName: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
} as const;

type AdminUserRow = Prisma.AdminUserGetPayload<{ select: typeof USER_SELECT }>;

/** E-mail пользователя админки — рабочий логин, в журнале он виден. */
const AUDIT_SNAPSHOT = { allowKeys: ['email'] } as const;

function toResponse(row: AdminUserRow): AdminUserResponse {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.displayName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Пользователи админки. Публичной регистрации нет: первого суперадмина
 * создаёт сид, остальных — суперадмин здесь.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<readonly AdminUserResponse[]> {
    const rows = await this.prisma.adminUser.findMany({ select: USER_SELECT, orderBy: [{ createdAt: 'asc' }] });

    return rows.map(toResponse);
  }

  async create(dto: CreateAdminUserDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminUserResponse> {
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.adminUser.create({
          data: { email: dto.email, passwordHash, role: dto.role, displayName: dto.displayName ?? null },
          select: USER_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'admin_user.create',
          entityType: 'admin_user',
          entityId: created.id,
          after: toResponse(created),
          meta,
          snapshot: AUDIT_SNAPSHOT,
        });

        return toResponse(created);
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Пользователь с таким e-mail уже есть');
      }

      throw error;
    }
  }

  /**
   * Смена роли, имени, активности. Понижение и деактивация гасят все сессии
   * пользователя сразу. Последнего активного суперадмина ни понизить,
   * ни отключить нельзя — иначе управлять админкой станет некому.
   */
  async update(
    id: string,
    dto: UpdateAdminUserDto,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<AdminUserResponse> {
    const changesRole = dto.role !== undefined;
    const deactivates = dto.isActive === false;

    if (id === actor.id && (changesRole || deactivates)) {
      throw new BadRequestException('Свою роль и активность меняет другой суперадмин');
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockUser(tx, id);
      const losesSuperAdmin =
        before.role === AdminRole.SUPER_ADMIN &&
        before.isActive &&
        ((changesRole && dto.role !== AdminRole.SUPER_ADMIN) || deactivates);

      if (losesSuperAdmin) {
        await this.assertAnotherActiveSuperAdmin(tx, id);
      }

      const revokesSessions = (changesRole && dto.role !== before.role) || (deactivates && before.isActive);
      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          ...(dto.role === undefined ? {} : { role: dto.role }),
          ...(dto.displayName === undefined ? {} : { displayName: dto.displayName }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(revokesSessions ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: USER_SELECT,
      });

      if (revokesSessions) {
        await this.refreshTokens.revokeAllForUser(tx, id);
      }

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'admin_user.update',
        entityType: 'admin_user',
        entityId: id,
        before: toResponse(before),
        after: toResponse(updated),
        meta,
        snapshot: AUDIT_SNAPSHOT,
      });

      return toResponse(updated);
    });
  }

  /** Сброс пароля суперадмином: заодно снимает блокировку входа и гасит сессии. */
  async resetPassword(id: string, dto: ResetPasswordDto, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, id);
      await tx.adminUser.update({
        where: { id },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
      });
      await this.refreshTokens.revokeAllForUser(tx, id);
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'admin_user.reset_password',
        entityType: 'admin_user',
        entityId: id,
        meta,
      });
    });
  }

  private async lockUser(tx: Prisma.TransactionClient, id: string): Promise<AdminUserRow> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "admin_user" WHERE "id" = ${id}::uuid FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundException('Пользователь не найден');
    }

    return tx.adminUser.findUniqueOrThrow({ where: { id }, select: USER_SELECT });
  }

  /**
   * Строки активных суперадминов блокируются: два параллельных понижения
   * двух последних суперадминов не должны оба увидеть «есть ещё один».
   */
  private async assertAnotherActiveSuperAdmin(tx: Prisma.TransactionClient, exceptId: string): Promise<void> {
    const others = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "admin_user"
       WHERE "role" = 'SUPER_ADMIN' AND "is_active" AND "id" <> ${exceptId}::uuid
       FOR UPDATE`;

    if (others.length === 0) {
      throw new ConflictException('Это последний активный суперадмин — сначала назначьте другого');
    }
  }
}
