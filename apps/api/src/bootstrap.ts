import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { API_GLOBAL_PREFIX } from './config/constants';
import type { AppConfig } from './config/configuration';

/**
 * Настройка HTTP-слоя приложения. Одна функция на `main.ts` и сквозные тесты:
 * тест, поднимающий приложение без того же префикса, helmet и ValidationPipe,
 * проверял бы другое приложение.
 */
export function configureApp(app: INestApplication): void {
  const http = app.get(ConfigService<AppConfig, true>).get('http', { infer: true });

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: [...http.corsOrigins], credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();
}
