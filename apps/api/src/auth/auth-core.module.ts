import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { AppConfig } from '../config/configuration';
import { DatabaseModule } from '../database/database.module';
import { AccessTokenService } from './access-token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtOrApiTokenGuard } from './guards/jwt-or-api-token.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Ядро авторизации админки: JWT и гарды. Отдельно от `AuthModule`
 * (контроллеры входа и пользователей), чтобы любой админский модуль мог
 * поставить `@UseGuards(JwtAuthGuard, RolesGuard)`, не затягивая за собой
 * журнал и сервисы сессий — и без циклических импортов.
 */
@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('adminAuth', { infer: true }).jwtSecret,
      }),
    }),
  ],
  providers: [AccessTokenService, JwtAuthGuard, JwtOrApiTokenGuard, RolesGuard],
  exports: [AccessTokenService, JwtAuthGuard, JwtOrApiTokenGuard, RolesGuard, DatabaseModule],
})
export class AuthCoreModule {}
