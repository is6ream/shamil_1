import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { CONTENT_ROLES } from '../auth/roles';
import { ReorderDto } from '../common/dto-transforms';
import { CreateVideoDto, UpdateVideoDto } from './dto/video.dto';
import { VideoService } from './video.service';
import type { AdminVideoResponse, PublicVideoResponse } from './video.service';

/** Публичный список видео со стройки — дешёвое чтение, без троттлинга, как витрина. */
@Controller('video')
@SkipThrottle()
export class VideoPublicController {
  constructor(private readonly videos: VideoService) {}

  @Get()
  list(): Promise<readonly PublicVideoResponse[]> {
    return this.videos.listPublished();
  }
}

@Controller('admin/videos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminVideoController {
  constructor(private readonly videos: VideoService) {}

  @Get()
  list(): Promise<readonly AdminVideoResponse[]> {
    return this.videos.listAll();
  }

  @Post()
  create(
    @Body() dto: CreateVideoDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminVideoResponse> {
    return this.videos.create(dto, admin, meta);
  }

  @Put('order')
  reorder(
    @Body() dto: ReorderDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<readonly AdminVideoResponse[]> {
    return this.videos.reorder(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminVideoResponse> {
    return this.videos.update(id, dto, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.videos.remove(id, admin, meta);
  }
}
