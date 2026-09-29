import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { PaymentProviderCode } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import type { PaymentProvider } from './payment-provider.interface';
import { PaymentProviderResolver } from './payment-provider.resolver';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import { PaymentsService } from './payments.service';
import { ManualProvider } from './providers/manual.provider';
import { RobokassaProvider } from './providers/robokassa.provider';

/**
 * Онлайн-провайдер приложения, если он включён.
 *
 * `PAYMENT_PROVIDER` теперь значит «какой онлайн-агрегатор подключён»:
 * `manual` — онлайн выключен целиком, и таб «Онлайн» получает 400 с просьбой
 * перевести по реквизитам. Это же и рубильник: выключить приём картой
 * в день проблем у агрегатора — одна переменная, пароли стирать не нужно.
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
function createOnlineProvider(config: ConfigService<AppConfig, true>): PaymentProvider | null {
  const { provider } = config.get('payment', { infer: true });

  switch (provider) {
    case PaymentProviderCode.Manual:
      return null;

    case PaymentProviderCode.Robokassa:
      return new RobokassaProvider(config);

    default: {
      const unknown: never = provider;

      throw new Error(`Неизвестный платёжный провайдер: ${String(unknown)}`);
    }
  }
}

export function createPaymentProviderResolver(config: ConfigService<AppConfig, true>): PaymentProviderResolver {
  const online = createOnlineProvider(config);

  return new PaymentProviderResolver({
    manual: new ManualProvider(config),
    online,
    // Без `channel` в запросе — прежнее поведение: провайдер из PAYMENT_PROVIDER.
    defaultChannel: online === null ? 'transfer' : 'online',
  });
}

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentCallbacksController],
  providers: [
    PaymentsService,
    {
      provide: PaymentProviderResolver,
      inject: [ConfigService],
      useFactory: createPaymentProviderResolver,
    },
  ],
  // PaymentsService экспортируется ради админского подтверждения ручного
  // доната: перевод pending → paid обязан идти через ту же машинерию, что
  // и вебхук, а не через вторую копию логики в админском модуле.
  exports: [PaymentProviderResolver, PaymentsService],
})
export class PaymentsModule {}
