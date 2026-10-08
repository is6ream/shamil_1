import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { CONTENT_ROLES, REQUISITES_ROLES } from '../auth/roles';
import { ContentService } from './content.service';
import { CONTENT_BLOCK_KEYS } from './content.types';
import type { AdminContentBlockResponse, ContentBlockKey, PublicContentResponse } from './content.types';
import { AboutBlockDto, ContactsBlockDto, FaqBlockDto, HeroBlockDto, RequisitesBlockDto } from './dto/content-blocks.dto';

/** Публичные тексты главной. Без троттлинга — как витрина: SSR ходит с одного IP. */
@Controller('content')
@SkipThrottle()
export class ContentPublicController {
  constructor(private readonly content: ContentService) {}

  @Get()
  get(): Promise<PublicContentResponse> {
    return this.content.getPublic();
  }
}

function parseKey(key: string): ContentBlockKey {
  const known = CONTENT_BLOCK_KEYS.find((candidate) => candidate === key);

  if (known === undefined) {
    throw new NotFoundException(`Блока «${key}» нет; допустимы: ${CONTENT_BLOCK_KEYS.join(', ')}`);
  }

  return known;
}

/**
 * Блоки главной в админке. На каждый ключ — свой маршрут `PUT`, чтобы тело
 * проверялось DTO именно этого блока глобальным ValidationPipe.
 */
@Controller('admin/content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  list(): Promise<readonly AdminContentBlockResponse[]> {
    return this.content.listAdmin();
  }

  @Get(':key')
  get(@Param('key') key: string): Promise<AdminContentBlockResponse> {
    return this.content.getAdmin(parseKey(key));
  }

  @Put('hero')
  hero(@Body() dto: HeroBlockDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<AdminContentBlockResponse<'hero'>> {
    return this.content.update('hero', dto, admin, meta);
  }

  @Put('about')
  about(@Body() dto: AboutBlockDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<AdminContentBlockResponse<'about'>> {
    return this.content.update('about', dto, admin, meta);
  }

  /** Реквизиты — куда уходят деньги; правит только суперадмин (D-17). */
  @Put('requisites')
  @Roles(...REQUISITES_ROLES)
  requisites(
    @Body() dto: RequisitesBlockDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminContentBlockResponse<'requisites'>> {
    return this.content.update('requisites', dto, admin, meta);
  }

  @Put('contacts')
  contacts(
    @Body() dto: ContactsBlockDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminContentBlockResponse<'contacts'>> {
    return this.content.update('contacts', dto, admin, meta);
  }

  @Put('faq')
  faq(@Body() dto: FaqBlockDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<AdminContentBlockResponse<'faq'>> {
    return this.content.update('faq', dto, admin, meta);
  }
}
