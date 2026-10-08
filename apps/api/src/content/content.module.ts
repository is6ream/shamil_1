import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { StorageModule } from '../media/storage/storage.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { AdminContentController, ContentPublicController } from './content.controller';
import { ContentService } from './content.service';
import { NewsService } from './news.service';
import { AdminNewsController, AdminStagesController, ContentReadController } from './stages-news.controller';
import { StagesService } from './stages.service';

/** Тексты главной, ход строительства и новости: правка в админке и публичные чтения. */
@Module({
  imports: [AuthCoreModule, AuditModule, RevalidationModule, StorageModule],
  controllers: [
    ContentPublicController,
    AdminContentController,
    ContentReadController,
    AdminStagesController,
    AdminNewsController,
  ],
  providers: [ContentService, StagesService, NewsService],
})
export class ContentModule {}
