import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../media/storage/storage.module';
import { CampaignService } from './campaign.service';
import { DonorsService } from './donors.service';
import { FeedService } from './feed.service';
import { GalleryService } from './gallery.service';
import { RegionsService } from './regions.service';
import { ShowcaseController } from './showcase.controller';

/**
 * Витрина одним модулем, но по сервису на сущность: все ручки — публичные
 * дешёвые чтения из витринных таблиц с общими правилами (без троттлинга,
 * BigInt → строка, ни байта ПДн), а разделение сервисов держит каждый
 * запрос в своём файле и тесте.
 */
@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [ShowcaseController],
  providers: [CampaignService, RegionsService, DonorsService, FeedService, GalleryService],
})
export class ShowcaseModule {}
