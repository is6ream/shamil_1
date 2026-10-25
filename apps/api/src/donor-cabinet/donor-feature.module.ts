import { Module } from '@nestjs/common';

import { validateEnv } from '../config/env.validation';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';

/**
 * Всё, что относится к кабинету жертвователя, — одним модулем: подключается
 * в `AppModule` только при `DONOR_CABINET_ENABLED=true`. Выключенный кабинет —
 * это 404 на `/donor/*`, а не полуработающие маршруты без почты и ключей.
 */
@Module({
  imports: [DonorAuthModule],
})
export class DonorFeatureModule {}

/** Условие для `ConditionalModule.registerWhen` — тем же разбором, что весь конфиг. */
export function isDonorCabinetEnabled(env: NodeJS.ProcessEnv): boolean {
  return validateEnv(env as Record<string, unknown>).DONOR_CABINET_ENABLED;
}
