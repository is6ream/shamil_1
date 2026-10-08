import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { MEDIA_ASSET_SELECT, mediaUrls } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { GalleryItemResponse } from './dto/showcase-response.dto';
import { toGalleryItemResponse } from './dto/showcase.mappers';

@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /**
   * Фото стройки — хронологически, с самых первых этапов (требование ТЗ,
   * блок 6). Пустой массив — не ошибка: фотографий пока нет, и фронтенд
   * показывает плашки-заглушки.
   */
  async getGallery(): Promise<readonly GalleryItemResponse[]> {
    const rows = await this.prisma.galleryItem.findMany({
      where: { isPublished: true, campaign: { slug: CAMPAIGN_SLUG } },
      orderBy: [{ sortOrder: 'asc' }, { takenOn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      select: {
        id: true,
        imageUrl: true,
        caption: true,
        altText: true,
        takenOn: true,
        width: true,
        height: true,
        mediaAsset: { select: MEDIA_ASSET_SELECT },
      },
    });

    // Ссылка строится от файла медиатеки, а не из сохранённой строки:
    // смена бакета или CDN не ломает уже загруженные фото.
    return rows.map((row) => {
      if (row.mediaAsset === null) {
        return toGalleryItemResponse(row);
      }

      const urls = mediaUrls(this.storage, row.mediaAsset.storageKey);

      return toGalleryItemResponse({ ...row, imageUrl: urls.lg, thumbUrl: urls.sm });
    });
  }
}
