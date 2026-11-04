import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';

import { readRequestMeta } from '../auth/request-meta';
import type { AppConfig } from '../config/configuration';
import {
  DONOR_REFRESH_COOKIE_NAME,
  DONOR_REFRESH_COOKIE_PATH,
  DONOR_REFRESH_THROTTLE,
  DONOR_THROTTLE,
  REQUEST_CODE_THROTTLE,
  VERIFY_CODE_THROTTLE,
} from './donor-auth.constants';
import { DonorAuthService } from './donor-auth.service';
import type { DonorPrincipal, DonorRequest, DonorRequestMeta, DonorSession } from './donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from './donor-jwt.guard';
import {
  CodeRequestedResponse,
  DonorSessionResponse,
  LoginMethodsResponse,
  RequestCodeDto,
  VerifyCodeDto,
  VkLinkDto,
  VkStartDto,
  VkStartResponse,
  readVkCallback,
} from './dto/donor-auth.dto';
import type { VkCallbackQuery } from './dto/donor-auth.dto';
import { VK_STATE_TTL_MS, VkAuthService } from './vk/vk-auth.service';

/** state входа через VK: только на маршруты VK и только на 10 минут. */
const VK_STATE_COOKIE_NAME = 'shamil_vk_state';
const VK_STATE_COOKIE_PATH = `${DONOR_REFRESH_COOKIE_PATH}/vk`;

/** Куда вести после неудачного входа через VK: окно входа покажет причину. */
const VK_ERROR_PATH = '/profile';

function refreshCookieOptions(secure: boolean, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: DONOR_REFRESH_COOKIE_PATH,
    ...(expires === undefined ? {} : { expires }),
  };
}

/**
 * Lax, а не Strict: колбэк — переход с id.vk.ru, межсайтовая навигация,
 * и Strict-cookie браузер в неё не положит. Lax уходит только с GET верхнего
 * уровня — ровно наш случай; из чужого fetch или формы POST её не будет.
 */
function stateCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: VK_STATE_COOKIE_PATH, maxAge: VK_STATE_TTL_MS };
}

/** Значение cookie по имени. Та же логика, что у админки, но свои имена cookie. */
export function readCookie(request: DonorRequest, name: string): string | null {
  const header = request.headers.cookie;

  if (typeof header !== 'string') {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator !== -1 && part.slice(0, separator).trim() === name) {
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

export function readDonorRefreshCookie(request: DonorRequest): string | null {
  return readCookie(request, DONOR_REFRESH_COOKIE_NAME);
}

function metaOf(request: DonorRequest): DonorRequestMeta {
  return readRequestMeta(request);
}

/**
 * Сессия кабинета жертвователя. Полностью отдельна от `admin/auth`:
 * другие маршруты, cookie, ключ и аудитория JWT.
 */
@ApiTags('donor')
@Controller('donor/auth')
export class DonorAuthController {
  private readonly logger = new Logger(DonorAuthController.name);
  private readonly cookieSecure: boolean;
  private readonly siteUrl: string;

  constructor(
    private readonly auth: DonorAuthService,
    private readonly vk: VkAuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cookieSecure = config.get('donor', { infer: true }).cookieSecure;
    this.siteUrl = config.get('publicUrls', { infer: true }).siteUrl;
  }

  /** Какие кнопки показать в окне входа. */
  @Get('methods')
  @Throttle({ default: DONOR_THROTTLE })
  @ApiOkResponse({ type: LoginMethodsResponse })
  methods(): LoginMethodsResponse {
    return { email: true, vk: this.vk.isEnabled };
  }

  /** Код на e-mail. Ответ одинаков, есть такой адрес или нет. */
  @Post('request-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: CodeRequestedResponse })
  async requestCode(@Body() dto: RequestCodeDto, @Req() request: DonorRequest): Promise<CodeRequestedResponse> {
    await this.auth.requestCode(dto.email, metaOf(request));

    return { accepted: true };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: VERIFY_CODE_THROTTLE })
  @ApiOkResponse({ type: DonorSessionResponse })
  async verify(
    @Body() dto: VerifyCodeDto,
    @Req() request: DonorRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DonorSessionResponse> {
    return this.respond(response, await this.auth.verify(dto.email, dto.code, metaOf(request)));
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
      return this.respond(response, await this.auth.refresh(token, metaOf(request)));
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        response.clearCookie(DONOR_REFRESH_COOKIE_NAME, refreshCookieOptions(this.cookieSecure));
      }

      throw error;
    }
  }

  /** Выход с этого устройства: его сессия отзывается на сервере, cookie стирается. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: DONOR_REFRESH_THROTTLE })
  async logout(@Req() request: DonorRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(readDonorRefreshCookie(request));
    response.clearCookie(DONOR_REFRESH_COOKIE_NAME, refreshCookieOptions(this.cookieSecure));
  }

  /**
   * Начало входа через VK: адрес формы VK ID и cookie со state. Фронт
   * вызывает это fetch-ом (cookie ставится на домен API) и уходит по `url`.
   */
  @Post('vk/start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: VkStartResponse })
  async vkStart(@Body() dto: VkStartDto, @Res({ passthrough: true }) response: Response): Promise<VkStartResponse> {
    const started = await this.vk.start('login', null, dto.returnTo);

    response.cookie(VK_STATE_COOKIE_NAME, started.state, stateCookieOptions(this.cookieSecure));

    return { url: started.url };
  }

  /** Привязать VK к кабинету, в который уже вошли (настройки). */
  @Post('vk/link')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DonorJwtGuard)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiBearerAuth()
  @ApiOkResponse({ type: VkStartResponse })
  async vkLink(
    @CurrentDonor() donor: DonorPrincipal,
    @Body() dto: VkLinkDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VkStartResponse> {
    const started = await this.vk.start('link', donor.id, dto.returnTo ?? '/profile/settings');

    response.cookie(VK_STATE_COOKIE_NAME, started.state, stateCookieOptions(this.cookieSecure));

    return { url: started.url };
  }

  /**
   * Redirect URL приложения VK ID. Тела нет, только 302: документация VK
   * требует, чтобы на странице обмена кода не было скриптов и встроенного
   * контента (иначе код утечёт через Referer). Любая неудача — обратно
   * на сайт с `?vk=error`, окно входа покажет человеческий текст.
   */
  @Get('vk/callback')
  @Throttle({ default: VERIFY_CODE_THROTTLE })
  async vkCallback(@Query() query: VkCallbackQuery, @Req() request: DonorRequest, @Res() response: Response): Promise<void> {
    const cookieState = readCookie(request, VK_STATE_COOKIE_NAME);

    response.clearCookie(VK_STATE_COOKIE_NAME, { ...stateCookieOptions(this.cookieSecure), maxAge: undefined });
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');

    const params = readVkCallback(query);

    if (params === null) {
      response.redirect(HttpStatus.FOUND, this.siteLink(VK_ERROR_PATH, 'error'));

      return;
    }

    try {
      const result = await this.vk.callback({ ...params, cookieState }, metaOf(request));

      if (result.purpose === 'login') {
        response.cookie(
          DONOR_REFRESH_COOKIE_NAME,
          result.session.refreshToken,
          refreshCookieOptions(this.cookieSecure, result.session.refreshExpiresAt),
        );
      }

      response.redirect(HttpStatus.FOUND, this.siteLink(result.returnTo, result.purpose === 'link' ? 'linked' : null));
    } catch (error: unknown) {
      if (!(error instanceof HttpException)) {
        throw error;
      }

      this.logger.warn(`Вход через VK не завершён: ${error.message}`);
      response.redirect(HttpStatus.FOUND, this.siteLink(VK_ERROR_PATH, error instanceof ConflictException ? 'taken' : 'error'));
    }
  }

  private siteLink(path: string, vkStatus: string | null): string {
    const url = new URL(path, `${this.siteUrl}/`);

    if (vkStatus !== null) {
      url.searchParams.set('vk', vkStatus);
    }

    return url.toString();
  }

  private respond(response: Response, session: DonorSession): DonorSessionResponse {
    response.cookie(
      DONOR_REFRESH_COOKIE_NAME,
      session.refreshToken,
      refreshCookieOptions(this.cookieSecure, session.refreshExpiresAt),
    );

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      donorId: session.donor.id,
      email: session.donor.email,
      isNew: session.isNew,
    };
  }
}
