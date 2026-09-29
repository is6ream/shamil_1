import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { RegionResponse, TopRegionsResponse } from './dto/showcase-response.dto';
import { toRegionRankRowResponse, toRegionResponse } from './dto/showcase.mappers';
import { TOP_REGIONS_LIMIT } from './showcase.constants';

/** Условие строки рейтинга землячеств: ранжируемый и включённый регион. */
const RANKED_REGION = { isRanked: true, isActive: true } as const;

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Справочник селектора «Откуда вы?». Порядок — как индекс
   * `(type, sort_order, name)`: страны, затем субъекты, Башкортостан первым.
   * «Россия» здесь есть: выбрать её можно, в рейтинг она не идёт.
   */
  async getRegions(): Promise<readonly RegionResponse[]> {
    const rows = await this.prisma.region.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, code: true, countryCode: true, name: true, type: true, flagUrl: true },
    });

    return rows.map(toRegionResponse);
  }

  /**
   * Топ-10 регионов и число пустых — одним ответом: фронтенд показывает
   * «ещё N регионов ждут первого пожертвования», и отдельный запрос ради
   * одного числа не нужен (docs/api-gaps.md §3).
   */
  async getTopRegions(): Promise<TopRegionsResponse> {
    const [rows, emptyCount] = await Promise.all([
      this.prisma.regionStats.findMany({
        where: { paidTotalKopecks: { gt: 0n }, region: RANKED_REGION },
        // Вторичный ключ — по имени: при равных суммах порядок не должен
        // прыгать от запроса к запросу.
        orderBy: [{ paidTotalKopecks: 'desc' }, { region: { name: 'asc' } }],
        take: TOP_REGIONS_LIMIT,
        select: {
          paidTotalKopecks: true,
          paidCount: true,
          region: { select: { slug: true, name: true, flagUrl: true } },
        },
      }),
      this.prisma.regionStats.count({
        where: { paidTotalKopecks: 0n, region: RANKED_REGION },
      }),
    ]);

    return { items: rows.map(toRegionRankRowResponse), emptyCount };
  }
}
