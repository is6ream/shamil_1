import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { DonationStatus } from '../generated/prisma/enums';
import type { DonorRankRowResponse } from './dto/showcase-response.dto';
import { toDonorRankRowResponse } from './dto/showcase.mappers';
import { TOP_DONORS_LIMIT } from './showcase.constants';

@Injectable()
export class DonorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Топ донатеров — **по одному платежу**, не по сумме от человека.
   * Другого ключа человека, кроме телефона из таблицы ПДн, нет, а в публичной
   * выборке к ней не прикасаемся. Решение по умолчанию, ждёт подтверждения
   * заказчика (docs/api-gaps.md §4).
   *
   * Попадают только снявшие анонимность сознательно и подписавшиеся:
   * садака — скрытое поклонение, анонимность включена по умолчанию.
   * Под запрос есть индекс `(status, is_anonymous, paid_amount_kopecks DESC)`.
   */
  async getTopDonors(): Promise<readonly DonorRankRowResponse[]> {
    const rows = await this.prisma.donation.findMany({
      where: { status: DonationStatus.paid, isAnonymous: false, donorName: { not: null } },
      orderBy: [{ paidAmountKopecks: 'desc' }, { paidAt: 'asc' }],
      take: TOP_DONORS_LIMIT,
      select: { donorName: true, paidAmountKopecks: true },
    });

    return rows.map(toDonorRankRowResponse);
  }
}
