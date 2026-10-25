import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { DONATION_READ_ROLES, SUBSCRIPTION_WRITE_ROLES } from '../auth/roles';
import type { Page } from '../common/pagination';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminSubscriptionsQueryDto } from './dto/admin-subscriptions.dto';
import type { AdminSubscriptionResponse, AdminSubscriptionStatsResponse } from './dto/admin-subscriptions.dto';

/**
 * Подписки в админке (только бэкенд; UI — отдельным этапом, REPORT.md).
 * Маршруты есть только при включённом кабинете — вместе со всем `/donor/*`.
 */
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminSubscriptionsController {
  constructor(private readonly service: AdminSubscriptionsService) {}

  @Get()
  @Roles(...DONATION_READ_ROLES)
  list(
    @Query() query: AdminSubscriptionsQueryDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<Page<AdminSubscriptionResponse>> {
    return this.service.list(query, admin);
  }

  @Get('stats')
  @Roles(...DONATION_READ_ROLES)
  stats(): Promise<AdminSubscriptionStatsResponse> {
    return this.service.stats();
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...SUBSCRIPTION_WRITE_ROLES)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ id: string; changed: boolean }> {
    return this.service.cancel(id, admin, meta);
  }
}
