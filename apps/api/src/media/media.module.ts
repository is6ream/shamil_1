import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import type { AppConfig } from '../config/configuration';
import { AdminGalleryController } from '../gallery/admin-gallery.controller';
import { AdminGalleryService } from '../gallery/admin-gallery.service';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { AdminVideoController, VideoPublicController } from '../video/video.controller';
import { VideoService } from '../video/video.service';
import { ImageProcessor } from './image-processor';
import { MediaUsageService } from './media-usage.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageModule } from './storage/storage.module';

/** Полей multipart рядом с файлом: только `altText`. */
const MAX_UPLOAD_FIELDS = 5;

/**
 * Медиатека, галерея и видео. Файл держится в памяти (memoryStorage по
 * умолчанию) до проверки сигнатуры и пережатия — на диск оригинал не пишется.
 */
@Module({
  imports: [
    AuthCoreModule,
    AuditModule,
    RevalidationModule,
    StorageModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        limits: {
          fileSize: config.get('media', { infer: true }).maxUploadBytes,
          files: 1,
          fields: MAX_UPLOAD_FIELDS,
        },
        // Кириллица в имени файла без этого приходит кракозябрами (latin1).
        defParamCharset: 'utf8',
      }),
    }),
  ],
  controllers: [MediaController, AdminGalleryController, AdminVideoController, VideoPublicController],
  providers: [MediaService, MediaUsageService, ImageProcessor, AdminGalleryService, VideoService],
  exports: [MediaUsageService, StorageModule],
})
export class MediaModule {}
