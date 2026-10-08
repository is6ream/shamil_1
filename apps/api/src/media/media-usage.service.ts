import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';

export interface MediaUsage {
  /** Где используется: `gallery_item`, `video_link`… */
  readonly entityType: string;
  readonly entityId: string;
  readonly label: string;
}

/**
 * Где используется файл медиатеки. Удаление используемого файла — 409:
 * иначе на сайте осталась бы битая картинка. Внешние ключи с RESTRICT —
 * страховка в базе, а этот список — понятный человеку ответ «где именно».
 */
@Injectable()
export class MediaUsageService {
  async findUsages(tx: Prisma.TransactionClient, mediaId: string): Promise<readonly MediaUsage[]> {
    const [gallery, videos] = await Promise.all([
      tx.galleryItem.findMany({ where: { mediaAssetId: mediaId }, select: { id: true, caption: true } }),
      tx.videoLink.findMany({ where: { posterMediaId: mediaId }, select: { id: true, title: true } }),
    ]);

    return [
      ...gallery.map((item) => ({ entityType: 'gallery_item', entityId: item.id, label: item.caption ?? 'Фото галереи' })),
      ...videos.map((video) => ({ entityType: 'video_link', entityId: video.id, label: video.title ?? 'Видео' })),
    ];
  }
}
