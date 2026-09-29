import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { DonationStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { FeedPageResponse } from './dto/showcase-response.dto';
import { toFeedItemResponse } from './dto/showcase.mappers';
import { FeedCursorError, decodeFeedCursor, encodeFeedCursor } from './feed-cursor';
import type { FeedCursor } from './feed-cursor';
import { FEED_DEFAULT_LIMIT } from './showcase.constants';

export interface FeedPageOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * Строки «после курсора» при сортировке `(paid_at DESC, id DESC)`.
 * Prisma не умеет row-value сравнение `(paid_at, id) < ($1, $2)`, поэтому
 * оно раскрыто вручную — индекс `(status, paid_at DESC, id DESC)` его покрывает.
 */
function afterCursor(cursor: FeedCursor): Prisma.DonationWhereInput {
  return {
    OR: [
      { paidAt: { lt: cursor.paidAt } },
      { paidAt: cursor.paidAt, id: { lt: cursor.id } },
    ],
  };
}

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Страница живой ленты поступлений. Нормализует малые суммы: видно,
   * что жертвуют по 100 ₽, и это нормально — прямо поддерживает слоган.
   *
   * Берётся `limit + 1` строка: лишняя говорит, есть ли следующая страница,
   * без отдельного `COUNT`.
   */
  async getPage(options: FeedPageOptions = {}): Promise<FeedPageResponse> {
    const limit = options.limit ?? FEED_DEFAULT_LIMIT;
    const cursor = options.cursor === undefined ? undefined : this.decode(options.cursor);

    const rows = await this.prisma.donation.findMany({
      where: {
        status: DonationStatus.paid,
        ...(cursor === undefined ? {} : afterCursor(cursor)),
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      // Поимённая выборка: `contact` (телефон, имя для сверки) сюда
      // не попадает физически — 152-ФЗ.
      select: {
        id: true,
        paidAt: true,
        paidAmountKopecks: true,
        method: true,
        isAnonymous: true,
        donorName: true,
        region: { select: { name: true } },
      },
    });

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last !== undefined && last.paidAt !== null
        ? encodeFeedCursor({ paidAt: last.paidAt, id: last.id })
        : null;

    return { items: page.map(toFeedItemResponse), nextCursor };
  }

  private decode(raw: string): FeedCursor {
    try {
      return decodeFeedCursor(raw);
    } catch (error: unknown) {
      if (error instanceof FeedCursorError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}
