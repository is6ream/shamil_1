import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Доступ к БД. Модули дня 6 (кампания, рейтинги, галерея) импортируют его явно,
 * а не получают клиент из воздуха — так видно, кто вообще ходит в базу.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
