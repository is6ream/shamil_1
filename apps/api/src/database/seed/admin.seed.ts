import { Logger } from '@nestjs/common';

import { normalizeEmail } from '../../auth/auth.service';
import { PasswordService } from '../../auth/password.service';
import type { PrismaClient } from '../../generated/prisma/client';
import { AdminRole } from '../../generated/prisma/enums';

const logger = new Logger('seed:admin');

export interface AdminSeedEnv {
  readonly ADMIN_SEED_EMAIL?: string;
  readonly ADMIN_SEED_PASSWORD?: string;
}

export type AdminSeedOutcome = 'created' | 'exists' | 'skipped';

/**
 * Первый суперадмин из `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`.
 *
 * Идемпотентно: если пользователь с таким e-mail уже есть, ничего не меняется —
 * ни пароль, ни роль. Повторный запуск сидов на проде не должен сбрасывать
 * пароль, который суперадмин уже сменил. Пароль не логируется никогда.
 */
export async function seedSuperAdmin(prisma: PrismaClient, env: AdminSeedEnv): Promise<AdminSeedOutcome> {
  const rawEmail = env.ADMIN_SEED_EMAIL?.trim() ?? '';
  const password = env.ADMIN_SEED_PASSWORD ?? '';

  if (rawEmail.length === 0 || password.length === 0) {
    logger.warn('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD не заданы — суперадмин не создан');

    return 'skipped';
  }

  const email = normalizeEmail(rawEmail);
  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });

  if (existing !== null) {
    logger.log('Суперадмин из ADMIN_SEED_EMAIL уже есть — не трогаем');

    return 'exists';
  }

  // PasswordService проверяет политику: слабый пароль из env не заводится.
  const passwordHash = await new PasswordService().hash(password);

  await prisma.adminUser.create({
    data: { email, passwordHash, role: AdminRole.SUPER_ADMIN, displayName: 'Суперадмин' },
  });

  logger.log('Суперадмин создан из ADMIN_SEED_EMAIL. Смените пароль после первого входа');

  return 'created';
}
