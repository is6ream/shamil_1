import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { readBearer } from '../auth/guards/jwt-auth.guard';
import type { DonorRequest } from '../donor-auth/donor-auth.types';
import { DonorJwtGuard } from '../donor-auth/donor-jwt.guard';

/**
 * Кто жертвует, если человек вошёл в кабинет. Форма доната публичная, и
 * токен здесь необязателен: нет его, он истёк или чужой — донат проходит
 * без `user_id`. Платёж важнее статистики (CLAUDE.md).
 *
 * Гард берётся через `ModuleRef`, а не инъекцией: модуль кабинета
 * подключается только при `DONOR_CABINET_ENABLED=true`, а модуль донатов
 * работает всегда.
 */
@Injectable()
export class OptionalDonorReader {
  private readonly logger = new Logger(OptionalDonorReader.name);
  private guard: DonorJwtGuard | null | undefined;

  constructor(private readonly moduleRef: ModuleRef) {}

  async donorId(request: DonorRequest): Promise<string | null> {
    const token = readBearer(request);
    const guard = token === null ? null : this.resolveGuard();

    if (token === null || guard === null) {
      return null;
    }

    try {
      return (await guard.authenticate(token)).id;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        return null;
      }

      throw error;
    }
  }

  private resolveGuard(): DonorJwtGuard | null {
    if (this.guard !== undefined) {
      return this.guard;
    }

    let guard: DonorJwtGuard | null;

    try {
      guard = this.moduleRef.get(DonorJwtGuard, { strict: false });
    } catch {
      // Кабинет выключен: провайдера нет — значит, и привязывать не к чему.
      this.logger.debug('Кабинет выключен — донат без привязки к жертвователю');
      guard = null;
    }

    this.guard = guard;

    return guard;
  }
}
