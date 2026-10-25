import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { API_GLOBAL_PREFIX } from '../config/constants';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DonorCabinetModule } from './donor-cabinet.module';

/** `/api/docs` — UI, `/api/docs-json` — схема. */
export const DONOR_SWAGGER_PATH = `${API_GLOBAL_PREFIX}/docs`;

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
