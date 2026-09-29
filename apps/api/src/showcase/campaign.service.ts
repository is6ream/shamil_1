import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { CampaignResponse } from './dto/showcase-response.dto';
import { toCampaignResponse } from './dto/showcase.mappers';
import { moscowToday } from './moscow-date';

/**
 * Цифры сбора для двойного прогресс-бара.
 *
 * Всё читается из витринных таблиц, которые пишет только триггер
 * `donation_stats_sync`: ни одного `SUM()` по донатам на каждое открытие
 * главной (CONTEXT.md §7).
 */
@Injectable()
export class CampaignService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaign(now: Date = new Date()): Promise<CampaignResponse> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { slug: CAMPAIGN_SLUG, isActive: true },
      select: {
        id: true,
        goalKopecks: true,
        stats: { select: { paidTotalKopecks: true, paidCount: true, lastPaidAt: true } },
      },
    });

    if (campaign === null) {
      throw new NotFoundException('Активный сбор не найден');
    }

    // Период ищется по сегодняшней дате в Москве — той же зоне, в которой
    // триггер решает, в какой месяц попал донат.
    const today = moscowToday(now);
    const monthlyGoal = await this.prisma.campaignMonthlyGoal.findFirst({
      where: {
        campaignId: campaign.id,
        periodStart: { lte: today },
        periodEnd: { gte: today },
      },
      select: { goalKopecks: true, collectedKopecks: true, periodStart: true, periodEnd: true },
    });

    return toCampaignResponse(campaign, campaign.stats, monthlyGoal);
  }
}
