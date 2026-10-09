import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';

/** Сколько ждать одну зависимость: проверку готовности дёргает балансировщик. */
export const READINESS_CHECK_TIMEOUT_MS = 3_000;

export type CheckStatus = 'ok' | 'fail';

export interface ReadinessStatus {
  readonly status: 'ok';
  readonly checks: {
    readonly database: CheckStatus;
    /** `s3` — HeadBucket, `local` — доступ к каталогу. */
    readonly storage: CheckStatus;
  };
  readonly storageDriver: StorageDriver['name'];
}

function withTimeout(check: Promise<unknown>): Promise<CheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('таймаут')), READINESS_CHECK_TIMEOUT_MS);
  });

  return Promise.race([check, timeout])
    .then((): CheckStatus => 'ok')
    .finally(() => clearTimeout(timer));
}

/**
 * Готовность к трафику: база отвечает, хранилище медиатеки доступно.
 * В отличие от `/health` (живость), здесь есть внешние зависимости — и при их
 * сбое ответ 503, чтобы балансировщик снял инстанс с трафика. Причина сбоя —
 * в лог, наружу только `fail`: внутренние адреса и тексты ошибок не отдаём.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async check(): Promise<ReadinessStatus> {
    const [database, storage] = await Promise.all([
      this.run('database', this.prisma.$queryRaw`SELECT 1`),
      this.run('storage', this.storage.ping()),
    ]);
    const checks = { database, storage };

    if (database !== 'ok' || storage !== 'ok') {
      throw new ServiceUnavailableException({ status: 'fail', checks, storageDriver: this.storage.name });
    }

    return { status: 'ok', checks, storageDriver: this.storage.name };
  }

  private async run(name: string, check: Promise<unknown>): Promise<CheckStatus> {
    try {
      return await withTimeout(check);
    } catch (error: unknown) {
      this.logger.warn(`Проверка готовности «${name}» не прошла: ${error instanceof Error ? error.message : String(error)}`);

      return 'fail';
    }
  }
}
