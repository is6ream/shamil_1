import { Module } from '@nestjs/common';

import { validateEnv } from '../../config/env.validation';
import { RobokassaEmulatorController } from './robokassa-emulator.controller';
import { RobokassaEmulatorService } from './robokassa-emulator.service';

/**
 * Локальный эмулятор оплаты Robokassa. Подключается в `AppModule` только
 * при `PAYMENT_EMULATOR_ENABLED=true` — мёртвых маршрутов в production нет.
 */
@Module({
  controllers: [RobokassaEmulatorController],
  providers: [RobokassaEmulatorService],
})
export class PaymentEmulatorModule {}

/**
 * Условие подключения для `ConditionalModule.registerWhen`.
 *
 * Функция, а не имя переменной: строковое условие `@nestjs/config` включает
 * модуль, когда переменной нет вовсе (`undefined !== 'false'`), — то есть
 * эмулятор поднимался бы по умолчанию. Флаг читается тем же разбором,
 * что и весь конфиг: `0`, `off`, пусто — это «выключено».
 */
export function isPaymentEmulatorEnabled(env: NodeJS.ProcessEnv): boolean {
  return validateEnv(env as Record<string, unknown>).PAYMENT_EMULATOR_ENABLED;
}
