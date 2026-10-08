import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { configuration } from './config/configuration';
import type { AppConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { DonationsModule } from './donations/donations.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import {
  PaymentEmulatorModule,
  isPaymentEmulatorEnabled,
} from './payments/emulator/payment-emulator.module';
import { ShowcaseModule } from './showcase/showcase.module';

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
    DonationsModule,
    AuthModule,
    AuditModule,
    AdminModule,
    MediaModule,
    ShowcaseModule,
    // Эмулятор оплаты — только локально: в production флаг запрещён
    // валидацией окружения, и маршрутов `/api/dev/…` там нет (404).
    ConditionalModule.registerWhen(PaymentEmulatorModule, isPaymentEmulatorEnabled),
  ],
  providers: [
    // Rate limiting по умолчанию на все эндпоинты: платёжная форма и вебхуки
    // — публичные точки входа, их перебирают ботами.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
