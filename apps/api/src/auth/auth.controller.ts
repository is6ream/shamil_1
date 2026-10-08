import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import type { AppConfig } from '../config/configuration';
import { ADMIN_THROTTLE, LOGIN_THROTTLE, REFRESH_THROTTLE } from './auth.constants';
import { AuthService } from './auth.service';
import type { AdminPrincipal, AuthRequest, IssuedSession, RequestMeta } from './auth.types';
import { CurrentAdmin } from './decorators';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { toMeResponse, toSessionResponse } from './dto/auth-response.dto';
import type { AdminMeResponse, SessionResponse } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { ReqMeta } from './request-meta';
import { AuditService } from '../audit/audit.service';

/**
 * Сессия админки (D-05). `login`, `refresh`, `logout` — без access-токена:
 * их защищают пароль, refresh-cookie и жёсткий троттлинг.
 */
@Controller('admin/auth')
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cookieSecure = config.get('adminAuth', { infer: true }).cookieSecure;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: LOGIN_THROTTLE })
  async login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(dto.email, dto.password, meta);

    await this.audit.record(undefined, {
      actor: { type: 'user', id: session.user.id, role: session.user.role, label: session.user.email },
      action: 'auth.login',
      entityType: 'admin_user',
      entityId: session.user.id,
      meta,
    });

    return this.respond(response, session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: REFRESH_THROTTLE })
  async refresh(
    @Req() request: AuthRequest,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const token = readRefreshCookie(request);

    if (token === null) {
      throw new UnauthorizedException('Сессия истекла или недействительна');
    }

    try {
      return this.respond(response, await this.auth.refresh(token, meta));
    } catch (error: unknown) {
      // Отозванная или чужая cookie больше не нужна браузеру.
      clearRefreshCookie(response, this.cookieSecure);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: REFRESH_THROTTLE })
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response, this.cookieSecure);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: ADMIN_THROTTLE })
  me(@CurrentAdmin() admin: AdminPrincipal): AdminMeResponse {
    return toMeResponse(admin);
  }

  /** Смена своего пароля. Прочие сессии гаснут, эта получает новую. */
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: LOGIN_THROTTLE })
  async changePassword(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: ChangePasswordDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.changePassword(admin.id, dto.currentPassword, dto.newPassword, meta, (tx) =>
      this.audit.record(tx, {
        actor: { type: 'user', id: admin.id, role: admin.role, label: admin.email },
        action: 'auth.password_change',
        entityType: 'admin_user',
        entityId: admin.id,
        meta,
      }),
    );

    return this.respond(response, session);
  }

  private respond(response: Response, session: IssuedSession): SessionResponse {
    setRefreshCookie(response, session.refreshToken, session.refreshExpiresAt, this.cookieSecure);

    return toSessionResponse(session);
  }
}
