import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';

export interface MediaUsage {
  /** Где используется: `gallery_item`, `video_link`, `construction_stage`, `news_post`, `content_block`. */
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
    // Последовательно, а не Promise.all: запросы идут в одной транзакции,
    // то есть по одному соединению.
    const gallery = await tx.galleryItem.findMany({ where: { mediaAssetId: mediaId }, select: { id: true, caption: true } });
    const videos = await tx.videoLink.findMany({ where: { posterMediaId: mediaId }, select: { id: true, title: true } });
    const stagePhotos = await tx.constructionStagePhoto.findMany({
      where: { mediaAssetId: mediaId },
      select: { stage: { select: { id: true, title: true } } },
    });
    const news = await tx.newsPost.findMany({ where: { coverMediaId: mediaId }, select: { id: true, title: true } });
    // Контент-блоки хранят id картинок внутри JSON — внешнего ключа там нет.
    const blocks = await tx.$queryRaw<{ key: string }[]>`
      SELECT "key" FROM "content_block" WHERE "data"::text LIKE ${`%"${mediaId}"%`}`;

    return [
      ...gallery.map((item) => ({ entityType: 'gallery_item', entityId: item.id, label: item.caption ?? 'Фото галереи' })),
      ...videos.map((video) => ({ entityType: 'video_link', entityId: video.id, label: video.title ?? 'Видео' })),
      ...stagePhotos.map((photo) => ({ entityType: 'construction_stage', entityId: photo.stage.id, label: photo.stage.title })),
      ...news.map((post) => ({ entityType: 'news_post', entityId: post.id, label: post.title })),
      ...blocks.map((block) => ({ entityType: 'content_block', entityId: block.key, label: `Блок «${block.key}»` })),
    ];
  }
}
