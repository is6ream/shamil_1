import { RecurringService } from './recurring/recurring.service';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { RECURRING_OPTIONS } from '../recurring-contract/contract';
import { RecurringManagementController } from './recurring/recurring-management.controller';
import { RecurringManagementService } from './recurring/recurring-management.service';
import { RECURRING_EVIDENCE_POLICY, RECURRING_TERMS_SOURCE, RECURRING_TRANSPORT, documentedEvidencePolicy, robokassaTransport } from './recurring/runtime-policy';
import { RECURRING_TERMS_ARCHIVE } from './recurring/terms';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { PaymentProviderCode } from '../config/env.validation';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { MetrikaModule } from '../metrika/metrika.module';
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
 * `manual` — провайдер отключён целиком, включая ResultURL.
 * Для остановки новых заказов используйте PAYMENT_ONLINE_ORDERS_ENABLED=false:
 * провайдер и проверка уведомлений ранее созданных заказов сохраняются.
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
    onlineOrdersEnabled: config.get('payment', { infer: true }).onlineOrdersEnabled,
    // Без `channel` в запросе — прежнее поведение: провайдер из PAYMENT_PROVIDER.
    defaultChannel: online === null ? 'transfer' : 'online',
  });
}

@Module({
  imports: [DatabaseModule, AuditModule, MetrikaModule, DonorAuthModule],
  controllers: [PaymentCallbacksController, RecurringManagementController],
  providers: [
    PaymentsService,
    RecurringService,
    RecurringManagementService,
    { provide: RECURRING_OPTIONS, inject: [ConfigService], useFactory: (config: ConfigService) => config.get('recurring') },
    { provide: RECURRING_TERMS_SOURCE, useValue: RECURRING_TERMS_ARCHIVE },
    { provide: RECURRING_EVIDENCE_POLICY, useValue: documentedEvidencePolicy },
    { provide: RECURRING_TRANSPORT, useValue: robokassaTransport },
    {
      provide: PaymentProviderResolver,
      inject: [ConfigService],
      useFactory: createPaymentProviderResolver,
    },
  ],
  // PaymentsService экспортируется ради админского подтверждения ручного
  // доната: перевод pending → paid обязан идти через ту же машинерию, что
  // и вебхук, а не через вторую копию логики в админском модуле.
  exports: [PaymentProviderResolver, PaymentsService, RecurringService],
})
export class PaymentsModule {}
