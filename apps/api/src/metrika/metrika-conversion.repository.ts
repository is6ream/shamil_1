import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { MetrikaConversionStatus } from '../generated/prisma/enums';
import {
  CONVERSION_MATCH_WINDOW_MS,
  CONVERSION_MIN_AGE_MS,
  LAST_ERROR_MAX_LENGTH,
  MAX_UPLOAD_ATTEMPTS,
  SKIP_REASONS,
  STALE_LOCK_MS,
} from './metrika.constants';

/** Строка, забранная на выгрузку. */
export interface ClaimedConversion {
  readonly id: string;
  readonly donationId: string;
  readonly clientId: string | null;
  readonly yclid: string | null;
  readonly target: string;
  readonly amountKopecks: bigint;
  readonly currency: string;
  readonly conversionAt: Date;
}

function truncateError(message: string): string {
  return message.slice(0, LAST_ERROR_MAX_LENGTH);
}

/** Доступ к outbox офлайн-конверсий. Все переходы статуса — здесь. */
@Injectable()
export class MetrikaConversionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Оплаты старше окна сопоставления выгружать бессмысленно — `SKIPPED/expired`. */
  async expireOld(now: Date): Promise<number> {
    const { count } = await this.prisma.metrikaOfflineConversion.updateMany({
      where: {
        status: MetrikaConversionStatus.PENDING,
        conversionAt: { lt: new Date(now.getTime() - CONVERSION_MATCH_WINDOW_MS) },
      },
      data: { status: MetrikaConversionStatus.SKIPPED, skipReason: SKIP_REASONS.expired },
    });

    return count;
  }

  /**
   * `UPLOADING` дольше `STALE_LOCK_MS` — инстанс упал посреди выгрузки: строки снова
   * в очередь, попытка засчитана. Строка, которая роняет инстанс раз за разом,
   * после `MAX_UPLOAD_ATTEMPTS` — `FAILED`, а не вечный цикл.
   */
  async reclaimStale(now: Date): Promise<number> {
    const where = {
      status: MetrikaConversionStatus.UPLOADING,
      lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) },
    };
    const lastError = 'Выгрузка прервана: инстанс не вернул строку из UPLOADING';

    const [failed, reclaimed] = await this.prisma.$transaction([
      this.prisma.metrikaOfflineConversion.updateMany({
        where: { ...where, attempts: { gte: MAX_UPLOAD_ATTEMPTS - 1 } },
        data: { status: MetrikaConversionStatus.FAILED, attempts: { increment: 1 }, lastError, lockedAt: null },
      }),
      this.prisma.metrikaOfflineConversion.updateMany({
        where,
        data: { status: MetrikaConversionStatus.PENDING, attempts: { increment: 1 }, lockedAt: null },
      }),
    ]);

    return failed.count + reclaimed.count;
  }

  /**
   * Забирает пачку `PENDING` в `UPLOADING` одним UPDATE.
   *
   * Почему `FOR UPDATE SKIP LOCKED`, а не advisory-lock: инстансов на App
   * Platform может быть несколько, а Prisma раздаёт запросы по пулу
   * соединений — сессионный advisory-lock пришлось бы держать на одном
   * соединении всё время HTTP-выгрузки. Здесь строка забирается короткой
   * транзакцией: параллельный инстанс пропускает заблокированные строки,
   * а после коммита видит их уже в `UPLOADING` и не берёт повторно.
   *
   * `conversion_at` не новее `now - CONVERSION_MIN_AGE_MS`: `DateTime`
   * в файле обязан быть в прошлом, иначе Метрика отклонит файл целиком.
   */
  claimBatch(now: Date, limit: number): Promise<ClaimedConversion[]> {
    const notAfter = new Date(now.getTime() - CONVERSION_MIN_AGE_MS);

    return this.prisma.$queryRaw<ClaimedConversion[]>`
      UPDATE "metrika_offline_conversion" AS c
      SET "status" = 'UPLOADING', "locked_at" = ${now}, "updated_at" = ${now}
      WHERE c."id" IN (
        SELECT "id" FROM "metrika_offline_conversion"
        WHERE "status" = 'PENDING' AND "conversion_at" <= ${notAfter}
        ORDER BY "created_at", "id"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING c."id", c."donation_id" AS "donationId", c."client_id" AS "clientId", c."yclid",
        c."target", c."amount_kopecks" AS "amountKopecks", c."currency", c."conversion_at" AS "conversionAt"`;
  }

  async markUploaded(ids: readonly string[], uploadingId: bigint): Promise<void> {
    await this.prisma.metrikaOfflineConversion.updateMany({
      where: { id: { in: [...ids] }, status: MetrikaConversionStatus.UPLOADING },
      data: {
        status: MetrikaConversionStatus.UPLOADED,
        uploadingId,
        attempts: { increment: 1 },
        lastError: null,
        lockedAt: null,
      },
    });
  }

  /**
   * Временный сбой (429, 5xx, сеть): строки обратно в очередь, попытка
   * засчитана. Исчерпавшие `MAX_UPLOAD_ATTEMPTS` — `FAILED`, без бесконечных повторов.
   */
  async markRetry(ids: readonly string[], error: string): Promise<void> {
    const where = { id: { in: [...ids] }, status: MetrikaConversionStatus.UPLOADING };
    const lastError = truncateError(error);

    await this.prisma.$transaction([
      this.prisma.metrikaOfflineConversion.updateMany({
        where: { ...where, attempts: { gte: MAX_UPLOAD_ATTEMPTS - 1 } },
        data: { status: MetrikaConversionStatus.FAILED, attempts: { increment: 1 }, lastError, lockedAt: null },
      }),
      this.prisma.metrikaOfflineConversion.updateMany({
        where,
        data: { status: MetrikaConversionStatus.PENDING, attempts: { increment: 1 }, lastError, lockedAt: null },
      }),
    ]);
  }

  /** Постоянная ошибка (401, 400): повтор даст тот же ответ. */
  async markFailed(ids: readonly string[], error: string): Promise<void> {
    await this.prisma.metrikaOfflineConversion.updateMany({
      where: { id: { in: [...ids] }, status: MetrikaConversionStatus.UPLOADING },
      data: {
        status: MetrikaConversionStatus.FAILED,
        attempts: { increment: 1 },
        lastError: truncateError(error),
        lockedAt: null,
      },
    });
  }

  /** Загрузки, ждущие обработки в Метрике. */
  async uploadingsAwaitingStatus(limit: number): Promise<bigint[]> {
    const rows = await this.prisma.metrikaOfflineConversion.findMany({
      where: { status: MetrikaConversionStatus.UPLOADED, uploadingId: { not: null } },
      select: { uploadingId: true },
      distinct: ['uploadingId'],
      orderBy: { uploadingId: 'asc' },
      take: limit,
    });

    return rows.flatMap((row) => (row.uploadingId === null ? [] : [row.uploadingId]));
  }

  uploadingRowCount(uploadingId: bigint): Promise<number> {
    return this.prisma.metrikaOfflineConversion.count({ where: { uploadingId } });
  }

  async markProcessed(uploadingId: bigint): Promise<number> {
    const { count } = await this.prisma.metrikaOfflineConversion.updateMany({
      where: { uploadingId, status: MetrikaConversionStatus.UPLOADED },
      data: { status: MetrikaConversionStatus.PROCESSED },
    });

    return count;
  }

  /** Метрика не сопоставила ни одного идентификатора файла с визитом. */
  async markLinkageFailure(uploadingId: bigint, error: string): Promise<number> {
    const { count } = await this.prisma.metrikaOfflineConversion.updateMany({
      where: { uploadingId, status: MetrikaConversionStatus.UPLOADED },
      data: { status: MetrikaConversionStatus.FAILED, lastError: truncateError(error) },
    });

    return count;
  }
}
