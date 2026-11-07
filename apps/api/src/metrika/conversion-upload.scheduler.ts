import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { ConversionUploadService } from './conversion-upload.service';

/**
 * Периодическая выгрузка офлайн-конверсий.
 *
 * `setInterval`, а не `@nestjs/schedule`: задача — «раз в N минут», cron-выражение
 * не нужно, а новая зависимость ради одного таймера — нет. Защита от наложения
 * проходов — флаг на инстанс; между инстансами — захват строк в репозитории.
 */
@Injectable()
export class ConversionUploadScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ConversionUploadScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    private readonly uploads: ConversionUploadService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    const { offlineEnabled, intervalMs } = this.config.get('metrika', { infer: true });

    if (!offlineEnabled) {
      this.logger.log('Выгрузка офлайн-конверсий выключена (YM_OFFLINE_ENABLED=false)');

      return;
    }

    this.timer = setInterval(() => void this.tick(), intervalMs);
    // Таймер не держит процесс: остановка контейнера не ждёт следующего прохода.
    this.timer.unref();
    this.logger.log(`Выгрузка офлайн-конверсий: раз в ${Math.round(intervalMs / 60_000)} мин`);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Один проход. Публичный — для тестов; повторный вызов во время прохода — no-op. */
  async tick(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.uploads.runOnce();
    } catch (error: unknown) {
      // Сбой прохода (база недоступна) не должен ронять процесс приёма платежей.
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Проход выгрузки в Метрику упал: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
