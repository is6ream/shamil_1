import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { ReorderDto } from '../common/dto-transforms';
import type { Page } from '../common/pagination';
import { AdminNewsQueryDto, CreateNewsDto, PublicNewsQueryDto, UpdateNewsDto } from './dto/news.dto';
import { CreateStageDto, UpdateStageDto } from './dto/stage.dto';
import { NewsService } from './news.service';
import type { AdminNewsPost, PublicNewsListItem, PublicNewsPost } from './news.service';
import { SLUG_PATTERN } from './slug';
import { StagesService } from './stages.service';
import type { AdminStageResponse, PublicConstructionResponse } from './stages.service';

/** Публичные чтения: ход строительства и опубликованные новости. */
@Controller()
@SkipThrottle()
export class ContentReadController {
  constructor(
    private readonly stages: StagesService,
    private readonly news: NewsService,
  ) {}

  @Get('construction')
  construction(): Promise<PublicConstructionResponse> {
    return this.stages.getPublic();
  }

  @Get('news')
  newsList(@Query() query: PublicNewsQueryDto): Promise<Page<PublicNewsListItem>> {
    return this.news.listPublished(query);
  }

  @Get('news/:slug')
  newsPost(@Param('slug') slug: string): Promise<PublicNewsPost> {
    if (!SLUG_PATTERN.test(slug)) {
      throw new NotFoundException('Новость не найдена');
    }

    return this.news.getPublished(slug);
  }
}

@Controller('admin/stages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminStagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  list(): Promise<readonly AdminStageResponse[]> {
    return this.stages.listAdmin();
  }

  @Post()
  create(@Body() dto: CreateStageDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<AdminStageResponse> {
    return this.stages.create(dto, admin, meta);
  }

  @Put('order')
  reorder(@Body() dto: ReorderDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<readonly AdminStageResponse[]> {
    return this.stages.reorder(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStageDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminStageResponse> {
    return this.stages.update(id, dto, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.stages.remove(id, admin, meta);
  }
}

@Controller('admin/news')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminNewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list(@Query() query: AdminNewsQueryDto): Promise<Page<AdminNewsPost>> {
    return this.news.listAdmin(query);
  }

  /** Черновик целиком — для предпросмотра в админке (D-12). */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminNewsPost> {
    return this.news.getAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateNewsDto, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<AdminNewsPost> {
    return this.news.create(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminNewsPost> {
    return this.news.update(id, dto, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminPrincipal, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.news.remove(id, admin, meta);
  }
}
