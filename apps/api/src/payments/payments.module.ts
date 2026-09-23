import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { PaymentProviderCode } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import { PaymentsService } from './payments.service';
import { ManualProvider } from './providers/manual.provider';
import { RobokassaProvider } from './providers/robokassa.provider';

/**
 * Фабрика активного провайдера.
 *
 * Провайдер в приложении ровно один и выбирается конфигом: переключение
 * `manual → robokassa` не должно требовать правок в коде — в день активации
 * мерчанта у нас будет время только на смену переменных окружения.
 *
 * Классы создаются здесь вручную, а не регистрируются провайдерами модуля,
 * намеренно: Nest поднимает всех провайдеров модуля сразу, а конструктор
 * `RobokassaProvider` падает без паролей. При `PAYMENT_PROVIDER=manual`
 * паролей нет и быть не должно — и приложение обязано стартовать.
 *
 * Неизвестный код провайдера роняет старт. Молчаливый откат на `manual`
 * был бы хуже падения: сбор продолжил бы работать, показывая реквизиты вместо
 * оплаты картой, и заметили бы это по просевшим поступлениям через сутки.
 */
function createPaymentProvider(config: ConfigService<AppConfig, true>): PaymentProvider {
  const { provider } = config.get('payment', { infer: true });

  switch (provider) {
    case PaymentProviderCode.Manual:
      return new ManualProvider(config);

    case PaymentProviderCode.Robokassa:
      return new RobokassaProvider(config);

    default: {
      const unknown: never = provider;

      throw new Error(`Неизвестный платёжный провайдер: ${String(unknown)}`);
    }
  }
}

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentCallbacksController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: createPaymentProvider,
    },
  ],
  // PaymentsService экспортируется ради админского подтверждения ручного
  // доната: перевод pending → paid обязан идти через ту же машинерию, что
  // и вебхук, а не через вторую копию логики в админском модуле.
  exports: [PAYMENT_PROVIDER, PaymentsService],
})
export class PaymentsModule {}
