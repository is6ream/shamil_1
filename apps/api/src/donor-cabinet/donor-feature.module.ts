import { Module } from '@nestjs/common';

import { AdminSubscriptionsModule } from '../admin-subscriptions/admin-subscriptions.module';
import { BillingModule } from '../billing/billing.module';
import { validateEnv } from '../config/env.validation';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { DonorCabinetModule } from './donor-cabinet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

/**
 * Всё, что относится к кабинету жертвователя, — одним модулем: подключается
 * в `AppModule` только при `DONOR_CABINET_ENABLED=true`. Выключенный кабинет —
 * это 404 на `/donor/*`, а не полуработающие маршруты без почты и ключей.
 */
@Module({
  imports: [DonorAuthModule, SubscriptionsModule, DonorCabinetModule, BillingModule, AdminSubscriptionsModule],
})
export class DonorFeatureModule {}

/** Условие для `ConditionalModule.registerWhen` — тем же разбором, что весь конфиг. */
export function isDonorCabinetEnabled(env: NodeJS.ProcessEnv): boolean {
  return validateEnv(env as Record<string, unknown>).DONOR_CABINET_ENABLED;
}
