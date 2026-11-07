import { Inject, Injectable, Logger } from '@nestjs/common';

import { MetrikaApiError, METRIKA_API } from './metrika-api';
import type { MetrikaApi, UploadingInfo } from './metrika-api';
import { MetrikaConversionRepository } from './metrika-conversion.repository';
import type { ClaimedConversion } from './metrika-conversion.repository';
import {
  STATUS_POLL_BATCH_SIZE,
  UPLOAD_BATCH_SIZE,
  UPLOADING_DONE_STATUS,
  UPLOADING_LINKAGE_FAILURE_STATUS,
} from './metrika.constants';
import { buildOfflineConversionsCsv, kopecksToRubles } from './offline-conversion-csv';
import type { ConversionRow, IdentifierType } from './offline-conversion-csv';

/** Итог одного прохода — для журнала и тестов. */
export interface UploadRunSummary {
  readonly expired: number;
  readonly reclaimed: number;
  readonly uploaded: number;
  readonly retried: number;
  readonly failed: number;
  readonly processed: number;
  readonly linkageFailed: number;
}

interface UploadGroup {
  readonly type: IdentifierType;
  readonly rows: readonly ClaimedConversion[];
}

type UploadOutcome = 'uploaded' | 'retried' | 'failed';

/**
 * ClientId приоритетнее yclid: он есть у любого визита со счётчиком, yclid —
 * только у клика из Директа. Одна строка уходит ровно в один файл —
 * иначе одна оплата стала бы двумя конверсиями.
 */
function groupByIdentifier(rows: readonly ClaimedConversion[]): UploadGroup[] {
  const byClientId = rows.filter((row) => row.clientId !== null);
  const byYclid = rows.filter((row) => row.clientId === null && row.yclid !== null);

  return [
    { type: 'CLIENT_ID' as const, rows: byClientId },
    { type: 'YCLID' as const, rows: byYclid },
  ].filter((group) => group.rows.length > 0);
}

function toCsvRow(row: ClaimedConversion, type: IdentifierType): ConversionRow {
  return {
    identifier: (type === 'CLIENT_ID' ? row.clientId : row.yclid) ?? '',
    target: row.target,
    conversionAt: row.conversionAt,
    price: kopecksToRubles(row.amountKopecks),
    currency: row.currency,
  };
}

/**
 * Один проход выгрузки офлайн-конверсий: вернуть зависшие, отсеять
 * просроченные, выгрузить пачку, опросить статусы прошлых загрузок.
 * Запускает планировщик; в тестах — напрямую, с фейковым API.
 */
@Injectable()
export class ConversionUploadService {
  private readonly logger = new Logger(ConversionUploadService.name);

  constructor(
    private readonly repository: MetrikaConversionRepository,
    @Inject(METRIKA_API) private readonly api: MetrikaApi | null,
  ) {}

  async runOnce(now: Date = new Date()): Promise<UploadRunSummary> {
    const api = this.requireApi();
    const reclaimed = await this.repository.reclaimStale(now);
    const expired = await this.repository.expireOld(now);
    const claimed = await this.repository.claimBatch(now, UPLOAD_BATCH_SIZE);
    const outcomes = { uploaded: 0, retried: 0, failed: 0 };

    for (const group of groupByIdentifier(claimed)) {
      const outcome = await this.uploadGroup(api, group, now);

      outcomes[outcome] += group.rows.length;
    }

    const polled = await this.pollStatuses(api);
    const summary: UploadRunSummary = { expired, reclaimed, ...outcomes, ...polled };

    this.logger.log(`Офлайн-конверсии: ${JSON.stringify(summary)}`);

    return summary;
  }

  private requireApi(): MetrikaApi {
    if (this.api === null) {
      throw new Error('Выгрузка в Метрику выключена (YM_OFFLINE_ENABLED=false) — проход не запускается');
    }

    return this.api;
  }

  private async uploadGroup(api: MetrikaApi, group: UploadGroup, now: Date): Promise<UploadOutcome> {
    const ids = group.rows.map((row) => row.id);
    const csv = buildOfflineConversionsCsv(
      group.type,
      group.rows.map((row) => toCsvRow(row, group.type)),
    );

    if (csv === null) {
      return 'uploaded';
    }

    try {
      const uploading = await api.uploadOfflineConversions({
        csv,
        comment: `shamil ${group.type} ${now.toISOString()} (${group.rows.length})`,
      });

      await this.repository.markUploaded(ids, uploading.id);
      if (await this.quarantineAcceptance(uploading, group.rows.length)) return 'failed';
      this.logger.log(
        `Загрузка ${uploading.id.toString()} (${group.type}): ${group.rows.length} строк, статус ${uploading.status}`,
      );

      return 'uploaded';
    } catch (error: unknown) {
      return this.handleUploadError(error, group);
    }
  }

  private async handleUploadError(error: unknown, group: UploadGroup): Promise<UploadOutcome> {
    const ids = group.rows.map((row) => row.id);
    const donationIds = group.rows.map((row) => row.donationId).join(', ');
    // Неизвестная ошибка — не ответ Метрики, а сбой у нас: повторяем, как сетевой.
    const isRetryable = !(error instanceof MetrikaApiError) || error.retryable;
    const message = error instanceof Error ? error.message : String(error);

    if (isRetryable) {
      await this.repository.markRetry(ids, message);
      this.logger.warn(`Выгрузка ${group.type} отложена (${message}); донаты: ${donationIds}`);

      return 'retried';
    }

    await this.repository.markFailed(ids, message);
    this.logger.error(`Выгрузка ${group.type} отклонена (${message}); донаты: ${donationIds}`);

    return 'failed';
  }

  private async quarantineAcceptance(info: UploadingInfo, expected: number): Promise<boolean> {
    if (info.sourceQuantity === expected && info.lineQuantity === expected) return false;
    const message = `acceptance_requires_review: source=${info.sourceQuantity ?? 'unknown'}, accepted=${info.lineQuantity ?? 'unknown'}, expected=${expected}; no automatic resend`;
    await this.repository.markLinkageFailure(info.id, message);
    this.logger.error(`Загрузка ${info.id}: ${message}`);
    return true;
  }

  /** Статус прошлых загрузок. Ошибка опроса не фатальна: спросим в следующий проход. */
  private async pollStatuses(api: MetrikaApi): Promise<{ processed: number; linkageFailed: number }> {
    const uploadingIds = await this.repository.uploadingsAwaitingStatus(STATUS_POLL_BATCH_SIZE);
    let processed = 0;
    let linkageFailed = 0;

    for (const uploadingId of uploadingIds) {
      try {
        const uploading = await api.getUploading(uploadingId);
        if (await this.quarantineAcceptance(uploading, await this.repository.uploadingRowCount(uploadingId))) continue;
        const { status } = uploading;

        if (status === UPLOADING_DONE_STATUS) {
          processed += await this.repository.markProcessed(uploadingId);
        } else if (status === UPLOADING_LINKAGE_FAILURE_STATUS) {
          linkageFailed += await this.repository.markLinkageFailure(
            uploadingId,
            `${UPLOADING_LINKAGE_FAILURE_STATUS}: Метрика не сопоставила идентификаторы с визитами`,
          );
          this.logger.warn(`Загрузка ${uploadingId.toString()}: ${UPLOADING_LINKAGE_FAILURE_STATUS}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.warn(`Статус загрузки ${uploadingId.toString()} не получен: ${message}`);
      }
    }

    return { processed, linkageFailed };
  }
}
