import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { AdminDonationsController } from './admin-donations.controller';
import { AdminDonationsService } from './admin-donations.service';
import { AdminTokenGuard } from './admin-token.guard';

/**
 * Админские эндпоинты. UI в MVP не планируется (CLAUDE.md): заказчик и разработчик
 * дёргают их напрямую, авторизация — статический токен из окружения.
 *
 * Модуль намеренно тонкий: вся работа с донатами идёт через `PaymentsService`,
 * здесь только маршрут, гард и разбор тела запроса.
 */
@Module({
  imports: [PaymentsModule],
  controllers: [AdminDonationsController],
  providers: [AdminDonationsService, AdminTokenGuard],
})
export class AdminModule {}
