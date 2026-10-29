import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { CONTENT_ROLES } from '../auth/roles';
import { CreateShortLinkDto, UpdateShortLinkDto } from './dto/short-link.dto';
import { ShortLinksService } from './short-links.service';
import type { AdminShortLink, ShortLinkList } from './short-links.service';

interface RedirectResponse {
  readonly url: string;
  readonly statusCode: number;
}

/**
 * `GET /api/go/:slug` → 302 на страницу сайта с UTM-метками.
 * Снаружи его зовёт route handler сайта `mechetshamil.ru/go/<slug>`:
 * в QR печатается основной домен, а не адрес API.
 *
 * `no-store`: закэшированный редирект не посчитал бы клик, а выключенная
 * ссылка продолжала бы вести на старую страницу.
 *
 * Без лимита запросов намеренно: зовёт его сервер сайта, и API видит один
 * IP на всех людей — лимит «на клиента» стал бы лимитом на весь QR сразу,
 * а после пятничного намаза его сканируют сотни человек за минуты.
 * Работа эндпоинта — один UPDATE по уникальному индексу; накрутку кликов
 * лимит по IP всё равно не остановил бы.
 */
@Controller('go')
@SkipThrottle()
export class ShortLinkRedirectController {
  constructor(private readonly shortLinks: ShortLinksService) {}

  @Get(':slug')
  @Redirect()
  @Header('Cache-Control', 'no-store')
  async redirect(
    @Param('slug') slug: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<RedirectResponse> {
    return { url: await this.shortLinks.resolveRedirect(slug, userAgent), statusCode: HttpStatus.FOUND };
  }
}

/** CRUD коротких ссылок — у тех же ролей, что правят контент сайта. */
@Controller('admin/short-links')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminShortLinksController {
  constructor(private readonly shortLinks: ShortLinksService) {}

  @Get()
  list(): Promise<ShortLinkList> {
    return this.shortLinks.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminShortLink> {
    return this.shortLinks.get(id);
  }

  @Post()
  create(
    @Body() dto: CreateShortLinkDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminShortLink> {
    return this.shortLinks.create(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShortLinkDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminShortLink> {
    return this.shortLinks.update(id, dto, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.shortLinks.remove(id, admin, meta);
  }
}
