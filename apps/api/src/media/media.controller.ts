import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { CONTENT_ROLES } from '../auth/roles';
import { PageQueryDto } from '../common/pagination';
import type { Page } from '../common/pagination';
import { UpdateMediaDto, UploadMediaDto } from './dto/media.dto';
import { MediaService } from './media.service';
import type { MediaAssetDetailResponse, MediaAssetResponse, UploadedImage } from './media.service';

/** Поле multipart с файлом. */
export const UPLOAD_FIELD = 'file';

@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CONTENT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Загрузка фото: `multipart/form-data`, поле `file`, необязательное `altText`.
   * Лимит размера — `MEDIA_MAX_UPLOAD_MB` (413 сверх него), форматы — JPEG/PNG/WebP
   * по сигнатуре файла (400 для остального).
   */
  @Post()
  @UseInterceptors(FileInterceptor(UPLOAD_FIELD))
  upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: UploadMediaDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MediaAssetResponse> {
    return this.media.upload(file, dto.altText ?? undefined, admin, meta);
  }

  @Get()
  list(@Query() query: PageQueryDto): Promise<Page<MediaAssetResponse>> {
    return this.media.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MediaAssetDetailResponse> {
    return this.media.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MediaAssetResponse> {
    return this.media.updateAlt(id, dto.altText, admin, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.media.remove(id, admin, meta);
  }
}
