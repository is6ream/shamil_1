import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { API_GLOBAL_PREFIX } from './config/constants';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Вебхуки платёжных провайдеров подписывают именно сырое тело запроса.
    // Подпись проверяется до разбора JSON, поэтому сырой буфер нужен всегда.
    rawBody: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const http = config.get('http', { infer: true });

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

  await app.listen(http.port);

  Logger.log(
    `Бэкенд слушает http://localhost:${http.port}/${API_GLOBAL_PREFIX}`,
    'Bootstrap',
  );
}

void bootstrap();
