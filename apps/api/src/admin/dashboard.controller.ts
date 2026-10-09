import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DONATION_READ_ROLES } from '../auth/roles';
import { DashboardService } from './dashboard.service';
import type { DashboardResponse } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...DONATION_READ_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query() query: DashboardQueryDto): Promise<DashboardResponse> {
    return this.dashboard.get(query);
  }
}
