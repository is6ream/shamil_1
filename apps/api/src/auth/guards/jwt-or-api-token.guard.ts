import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isSameSecret } from '../../admin/admin-token.guard';
import type { AppConfig } from '../../config/configuration';
import type { AuthRequest } from '../auth.types';
import { JwtAuthGuard, readBearer } from './jwt-auth.guard';

/**
 * D-07: подтверждение ручного перевода принимает либо сессию админки,
 * либо старый статический `ADMIN_API_TOKEN` — скрипты и инструкции,
 * написанные под токен, продолжают работать.
 *
 * Пустой `ADMIN_API_TOKEN` токенный путь закрывает полностью, сессия при этом
 * работает. Сравнение токена — за постоянное время.
 */
@Injectable()
export class JwtOrApiTokenGuard implements CanActivate {
  private readonly apiToken: string;

  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    config: ConfigService<AppConfig, true>,
  ) {
    this.apiToken = config.get('admin', { infer: true }).apiToken;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readBearer(request);

    if (token === null) {
      throw new UnauthorizedException('Требуется вход');
    }

    if (this.apiToken.length > 0 && isSameSecret(token, this.apiToken)) {
      request.viaApiToken = true;

      return true;
    }

    request.admin = await this.jwtGuard.authenticate(token);

    return true;
  }
}
