import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { DONATION_READ_ROLES, GOAL_ROLES } from '../auth/roles';
import { CampaignAdminService } from './campaign-admin.service';
import type { CampaignAdminResponse, MonthlyGoalAdminResponse } from './campaign-admin.service';
import { CreateMonthlyGoalDto, UpdateCampaignDto, UpdateMonthlyGoalDto } from './dto/campaign.dto';

@Controller('admin/campaign')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...GOAL_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class CampaignAdminController {
  constructor(private readonly campaign: CampaignAdminService) {}

  /** Цифры сбора видит и бухгалтер — менять цели он не может. */
  @Get()
  @Roles(...DONATION_READ_ROLES)
  get(): Promise<CampaignAdminResponse> {
    return this.campaign.get();
  }

  @Patch()
  updateGoal(
    @Body() dto: UpdateCampaignDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<CampaignAdminResponse> {
    return this.campaign.updateGoal(dto, admin, meta);
  }

  @Post('monthly-goals')
  createMonthlyGoal(
    @Body() dto: CreateMonthlyGoalDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MonthlyGoalAdminResponse> {
    return this.campaign.createMonthlyGoal(dto, admin, meta);
  }

  @Patch('monthly-goals/:id')
  updateMonthlyGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMonthlyGoalDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MonthlyGoalAdminResponse> {
    return this.campaign.updateMonthlyGoal(id, dto, admin, meta);
  }

  @Delete('monthly-goals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMonthlyGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.campaign.deleteMonthlyGoal(id, admin, meta);
  }
}
