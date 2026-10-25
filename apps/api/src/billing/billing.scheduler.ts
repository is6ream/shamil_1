import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';

import type { AppConfig } from '../config/configuration';
import { BillingService } from './billing.service';

/**
 * Тик автосписаний по `BILLING_CRON` (по умолчанию каждые 5 минут).
 * Включается флагом `BILLING_SCHEDULER_ENABLED`; в тестах выключен.
 *
 * Внутри процесса тики не перекрываются (`isRunning`), между процессами —
 * блокировки в БД (см. `BillingService`).
 *
 * `CronJob` из пакета `cron` напрямую, без `@nestjs/schedule`: версия 12
 * поставляется только как ES-модуль, и jest на Node 22 её не загружает,
 * а движок у неё тот же самый `cron`.
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BillingScheduler.name);
  private isRunning = false;
  private job: CronJob | null = null;

  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    const billing = this.config.get('billing', { infer: true });

    if (!billing.schedulerEnabled) {
      this.logger.log('Планировщик автосписаний выключен (BILLING_SCHEDULER_ENABLED=false)');

      return;
    }

    this.job = CronJob.from({ cronTime: billing.cron, onTick: () => this.tick(), start: true });
    this.logger.log(`Планировщик автосписаний запущен: ${billing.cron}`);
  }

  onModuleDestroy(): void {
    void this.job?.stop();
    this.job = null;
  }

  async tick(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.billing.runTick();

      if (result.claimed > 0 || result.reconciled > 0) {
        this.logger.log(
          `Автосписания: взято ${result.claimed}, отправлено ${result.submitted}, сверено ${result.reconciled}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error('Тик автосписаний упал', error instanceof Error ? error.stack : String(error));
    } finally {
      this.isRunning = false;
    }
  }
}
