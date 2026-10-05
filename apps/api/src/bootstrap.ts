import { ValidationPipe } from '@nestjs/common';
import type { INestApplication, ValidationPipeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { API_GLOBAL_PREFIX } from './config/constants';
import type { AppConfig } from './config/configuration';

/**
 * Опции глобального `ValidationPipe`. `forbidNonWhitelisted` — не косметика:
 * лишний ключ в теле (например, периодичность от старого клиента) даёт 400,
 * а не молча отбрасывается. Пожертвования только разовые, и клиент должен
 * узнать об этом, а не думать, что оформил подписку.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};

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

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

  app.enableShutdownHooks();
}
