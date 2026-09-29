import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { CampaignService } from './campaign.service';
import { DonorsService } from './donors.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import type {
  CampaignResponse,
  DonorRankRowResponse,
  FeedPageResponse,
  GalleryItemResponse,
  RegionResponse,
  TopRegionsResponse,
} from './dto/showcase-response.dto';
import { FeedService } from './feed.service';
import { GalleryService } from './gallery.service';
import { RegionsService } from './regions.service';

/**
 * Витрина: публичные чтения для главной, «Отчётов» и галереи.
 *
 * `@SkipThrottle` на весь контроллер: это дешёвые чтения из витринных таблиц,
 * а SSR Next.js ходит сюда с одного IP — под глобальным лимитом 60/мин
 * главная на проде получила бы 429 от собственного бэкенда. Строгий лимит
 * остаётся там, где он защищает, — на `POST /donations`.
 *
 * Пути разные (`campaign`, `regions`, `donors`, `donations/feed`, `gallery`),
 * поэтому префикс контроллера пустой; глобальный `/api` добавляет main.ts.
 */
@Controller()
@SkipThrottle()
export class ShowcaseController {
  constructor(
    private readonly campaign: CampaignService,
    private readonly regions: RegionsService,
    private readonly donors: DonorsService,
    private readonly feed: FeedService,
    private readonly gallery: GalleryService,
  ) {}

  @Get('campaign')
  getCampaign(): Promise<CampaignResponse> {
    return this.campaign.getCampaign();
  }

  @Get('regions')
  getRegions(): Promise<readonly RegionResponse[]> {
    return this.regions.getRegions();
  }

  @Get('regions/top')
  getTopRegions(): Promise<TopRegionsResponse> {
    return this.regions.getTopRegions();
  }

  @Get('donors/top')
  getTopDonors(): Promise<readonly DonorRankRowResponse[]> {
    return this.donors.getTopDonors();
  }

  @Get('donations/feed')
  getFeed(@Query() query: FeedQueryDto): Promise<FeedPageResponse> {
    return this.feed.getPage({ cursor: query.cursor, limit: query.limit });
  }

  @Get('gallery')
  getGallery(): Promise<readonly GalleryItemResponse[]> {
    return this.gallery.getGallery();
  }
}
