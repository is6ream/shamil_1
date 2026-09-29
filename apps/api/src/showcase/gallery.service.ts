import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { GalleryItemResponse } from './dto/showcase-response.dto';
import { toGalleryItemResponse } from './dto/showcase.mappers';

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Фото стройки — хронологически, с самых первых этапов (требование ТЗ,
   * блок 6). Пустой массив — не ошибка: фотографий пока нет, и фронтенд
   * показывает плашки-заглушки.
   */
  async getGallery(): Promise<readonly GalleryItemResponse[]> {
    const rows = await this.prisma.galleryItem.findMany({
      where: { isPublished: true, campaign: { slug: CAMPAIGN_SLUG } },
      orderBy: [{ sortOrder: 'asc' }, { takenOn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      select: { id: true, imageUrl: true, caption: true, altText: true, takenOn: true },
    });

    return rows.map(toGalleryItemResponse);
  }
}
