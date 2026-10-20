import { Module } from '@nestjs/common';

import { AttributionService } from './attribution.service';

/**
 * Атрибуция: нормализация UTM-меток и источник по Referer.
 * Своих маршрутов нет — сервис вызывают донаты при создании заказа.
 */
@Module({
  providers: [AttributionService],
  exports: [AttributionService],
})
export class AttributionModule {}
