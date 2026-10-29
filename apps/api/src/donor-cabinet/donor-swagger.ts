import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { AppConfig } from '../config/configuration';
import { API_GLOBAL_PREFIX } from '../config/constants';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DonorCabinetModule } from './donor-cabinet.module';

/** `/api/docs` — UI, `/api/docs-json` — схема. */
export const DONOR_SWAGGER_PATH = `${API_GLOBAL_PREFIX}/docs`;

/**
 * Поднимать ли Swagger: только при включённом кабинете и только вне production —
 * `swaggerEnabled` в production всегда `false`, что бы ни стояло в `SWAGGER_ENABLED`.
 */
export function isDonorSwaggerEnabled(config: ConfigService<AppConfig, true>): boolean {
  return config.get('swaggerEnabled', { infer: true }) && config.get('donor', { infer: true }).enabled;
}

/**
 * Swagger только для `/donor/*` — контракт для фронтенда кабинета.
 * Админка и платёжные колбэки в документ не попадают намеренно.
 * Поднимается только вне production (`AppConfig.swaggerEnabled`):
 * публичная карта API боевому сайту ни к чему.
 */
export function setupDonorSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Мечеть «Шамиль» — кабинет жертвователя')
    .setDescription('Вход по коду на e-mail, ежемесячные пожертвования, история. Суммы — в копейках.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    include: [DonorAuthModule, SubscriptionsModule, DonorCabinetModule],
  });

  SwaggerModule.setup(DONOR_SWAGGER_PATH, app, document);
}
