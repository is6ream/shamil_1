import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { DatabaseModule } from '../database/database.module';
import { ConversionEnqueueService } from './conversion-enqueue.service';
import { ConversionUploadScheduler } from './conversion-upload.scheduler';
import { ConversionUploadService } from './conversion-upload.service';
import { HttpMetrikaApi, METRIKA_API } from './metrika-api';
import type { MetrikaApi } from './metrika-api';
import { MetrikaConversionRepository } from './metrika-conversion.repository';

/** Адаптер API — только при включённой выгрузке: без токена создавать нечего. */
export function createMetrikaApi(config: ConfigService<AppConfig, true>): MetrikaApi | null {
  const { offlineEnabled, counterId, oauthToken } = config.get('metrika', { infer: true });

  if (!offlineEnabled || counterId === undefined || oauthToken === undefined) {
    return null;
  }

  return new HttpMetrikaApi({ counterId, token: oauthToken });
}

/**
 * Офлайн-конверсии Яндекс Метрики: очередь оплат и её выгрузка.
 * `ConversionEnqueueService` экспортируется для `PaymentsService` — постановка
 * в очередь идёт в транзакции перехода доната в `paid`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    ConversionEnqueueService,
    MetrikaConversionRepository,
    ConversionUploadService,
    ConversionUploadScheduler,
    { provide: METRIKA_API, inject: [ConfigService], useFactory: createMetrikaApi },
  ],
  exports: [ConversionEnqueueService],
})
export class MetrikaModule {}
