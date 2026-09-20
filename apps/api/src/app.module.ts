import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { configuration } from './config/configuration';
import type { AppConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      // Локально читаем .env из корня монорепозитория; на проде переменные
      // приходят из окружения контейнера, файла там нет.
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const throttle = config.get('throttle', { infer: true });

        return [{ ttl: throttle.ttlMs, limit: throttle.limit }];
      },
    }),
    DatabaseModule,
    HealthModule,
  ],
  providers: [
    // Rate limiting по умолчанию на все эндпоинты: платёжная форма и вебхуки
    // — публичные точки входа, их перебирают ботами.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
