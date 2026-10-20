import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DONATION_READ_ROLES } from '../auth/roles';
import { AnalyticsService } from './analytics.service';
import type { DonationsBySourceResponse } from './analytics.service';
import { DonationsBySourceQueryDto } from './dto/donations-by-source.dto';

/** Аналитика сбора в админке. ПДн в отчётах нет — только агрегаты по меткам. */
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...DONATION_READ_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('donations-by-source')
  donationsBySource(@Query() query: DonationsBySourceQueryDto): Promise<DonationsBySourceResponse> {
    return this.analytics.donationsBySource(query);
  }
}
