import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { CONTENT_ROLES } from '../auth/roles';
import { ReorderDto } from '../common/dto-transforms';
import { AdminGalleryService } from './admin-gallery.service';
import type { AdminGalleryItemResponse } from './admin-gallery.service';
import { CreateGalleryItemDto, UpdateGalleryItemDto } from './dto/gallery.dto';

@Controller('admin/gallery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminGalleryController {
  constructor(private readonly gallery: AdminGalleryService) {}

  @Get()
  list(): Promise<readonly AdminGalleryItemResponse[]> {
    return this.gallery.list();
  }

  @Post()
  create(
    @Body() dto: CreateGalleryItemDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminGalleryItemResponse> {
    return this.gallery.create(dto, admin, meta);
  }

  @Put('order')
  reorder(
    @Body() dto: ReorderDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<readonly AdminGalleryItemResponse[]> {
    return this.gallery.reorder(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGalleryItemDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminGalleryItemResponse> {
    return this.gallery.update(id, dto, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.gallery.remove(id, admin, meta);
  }
}
