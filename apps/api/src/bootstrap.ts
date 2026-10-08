import { ValidationPipe } from '@nestjs/common';
import type { ValidationPipeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Express, Response } from 'express';
import helmet from 'helmet';

import { API_GLOBAL_PREFIX } from './config/constants';
import { MEDIA_ROUTE_PREFIX } from './config/configuration';
import type { AppConfig } from './config/configuration';
import { StorageDriver } from './config/env.validation';
import { IMMUTABLE_CACHE_CONTROL } from './media/storage/storage.types';

/**
 * Сколько обратных прокси стоит перед приложением. На Timeweb Cloud App Platform
 * запросы приходят через их балансировщик. Без `trust proxy` Express видит
 * в `req.ip` адрес прокси, и `@nestjs/throttler` считает всех посетителей
 * одним клиентом: лимит заканчивается на весь сайт сразу.
 *
 * Ровно 1, а не `true`: при `true` Express берёт самый левый адрес из
 * `X-Forwarded-For`, который клиент подставляет сам, и обходит лимит.
 */
export const TRUSTED_PROXY_HOPS = 1;

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
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<AppConfig, true>);
  const http = config.get('http', { infer: true });
  const media = config.get('media', { infer: true });

  const express: Express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', TRUSTED_PROXY_HOPS);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: [...http.corsOrigins], credentials: true });

  if (media.driver === StorageDriver.Local) {
    serveLocalMedia(app, media.localDir);
  }

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

  app.enableShutdownHooks();
}

/**
 * Раздача медиатеки с диска — только при `STORAGE_DRIVER=local` (dev/test).
 * В production картинки отдаёт бакет S3 по `S3_PUBLIC_BASE_URL` (D-16, пересмотрено).
 *
 * `Cross-Origin-Resource-Policy: cross-origin` перекрывает `same-origin` от helmet:
 * картинки грузит сайт с другого порта/домена.
 */
function serveLocalMedia(app: NestExpressApplication, localDir: string): void {
  app.useStaticAssets(localDir, {
    prefix: MEDIA_ROUTE_PREFIX,
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    setHeaders: (response: Response) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      response.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
    },
  });
}
