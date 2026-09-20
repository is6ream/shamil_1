import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { AppConfig } from '../config/configuration';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Единственный клиент БД на приложение.
 *
 * Prisma 7 работает через драйвер-адаптер: строка подключения приходит не из
 * schema.prisma, а отсюда — то есть из провалидированного конфига, как и все
 * остальные секреты.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<AppConfig, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('database', { infer: true }).url,
      }),
      // Логирование запросов выключено намеренно: в параметрах ездят телефоны
      // донатеров, а 152-ФЗ не допускает ПДн в логах (CONTEXT.md §7).
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к PostgreSQL установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
