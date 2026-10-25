import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';

import type { AppConfig } from '../config/configuration';
import {
  DONOR_REFRESH_COOKIE_NAME,
  DONOR_REFRESH_COOKIE_PATH,
  DONOR_REFRESH_THROTTLE,
  REQUEST_CODE_THROTTLE,
  VERIFY_CODE_THROTTLE,
} from './donor-auth.constants';
import { DonorAuthService } from './donor-auth.service';
import type { DonorRequest, DonorSession } from './donor-auth.types';
import { CodeRequestedResponse, DonorSessionResponse, RequestCodeDto, VerifyCodeDto } from './dto/donor-auth.dto';

function cookieOptions(secure: boolean, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: DONOR_REFRESH_COOKIE_PATH,
    ...(expires === undefined ? {} : { expires }),
  };
}

/** Значение refresh-cookie кабинета. Та же логика, что у админки, но своё имя cookie. */
export function readDonorRefreshCookie(request: DonorRequest): string | null {
  const header = request.headers.cookie;

  if (typeof header !== 'string') {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator !== -1 && part.slice(0, separator).trim() === DONOR_REFRESH_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();

      try {
        return value.length > 0 ? decodeURIComponent(value) : null;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Сессия кабинета жертвователя. Полностью отдельна от `admin/auth`:
 * другие маршруты, cookie, ключ и аудитория JWT.
 */
@ApiTags('donor')
@Controller('donor/auth')
export class DonorAuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: DonorAuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cookieSecure = config.get('donor', { infer: true }).cookieSecure;
  }

  /** Код на e-mail. Ответ одинаков, есть такой адрес или нет. */
  @Post('request-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: CodeRequestedResponse })
  async requestCode(@Body() dto: RequestCodeDto): Promise<CodeRequestedResponse> {
    await this.auth.requestCode(dto.email);

    return { accepted: true };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: VERIFY_CODE_THROTTLE })
  @ApiOkResponse({ type: DonorSessionResponse })
  async verify(@Body() dto: VerifyCodeDto, @Res({ passthrough: true }) response: Response): Promise<DonorSessionResponse> {
    return this.respond(response, await this.auth.verify(dto.email, dto.code));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: DONOR_REFRESH_THROTTLE })
  @ApiCookieAuth(DONOR_REFRESH_COOKIE_NAME)
  @ApiOkResponse({ type: DonorSessionResponse })
  async refresh(@Req() request: DonorRequest, @Res({ passthrough: true }) response: Response): Promise<DonorSessionResponse> {
    const token = readDonorRefreshCookie(request);

    if (token === null) {
      throw new UnauthorizedException('Сессия истекла или недействительна');
    }

    try {
      return this.respond(response, await this.auth.refresh(token));
    } catch (error: unknown) {
      response.clearCookie(DONOR_REFRESH_COOKIE_NAME, cookieOptions(this.cookieSecure));
      throw error;
    }
  }

  /** Выход на всех устройствах: версия сессий растёт. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: DONOR_REFRESH_THROTTLE })
  async logout(@Req() request: DonorRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readDonorRefreshCookie(request));
    response.clearCookie(DONOR_REFRESH_COOKIE_NAME, cookieOptions(this.cookieSecure));
  }

  private respond(response: Response, session: DonorSession): DonorSessionResponse {
    response.cookie(DONOR_REFRESH_COOKIE_NAME, session.refreshToken, cookieOptions(this.cookieSecure, session.refreshExpiresAt));

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      donorId: session.donor.id,
      email: session.donor.email,
      isNew: session.isNew,
    };
  }
}
