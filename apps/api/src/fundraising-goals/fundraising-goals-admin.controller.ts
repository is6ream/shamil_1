import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { DONATION_READ_ROLES, GOAL_ROLES } from '../auth/roles';
import type { Page } from '../common/pagination';
import { CreateGoalDto, GoalListQueryDto, UpdateGoalDto } from './dto/goal.dto';
import type { GoalAdminResponse } from './dto/goal-response.dto';
import { FundraisingGoalsService } from './fundraising-goals.service';

/**
 * Этапы сбора (D-06: меняют SUPER_ADMIN и EDITOR, смотрит и бухгалтер).
 * Физического удаления нет — только архив.
 */
@Controller('admin/goals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...GOAL_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class FundraisingGoalsAdminController {
  constructor(private readonly goals: FundraisingGoalsService) {}

  @Get()
  @Roles(...DONATION_READ_ROLES)
  list(@Query() query: GoalListQueryDto): Promise<Page<GoalAdminResponse>> {
    return this.goals.list(query);
  }

  @Get(':id')
  @Roles(...DONATION_READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GoalAdminResponse> {
    return this.goals.get(id);
  }

  @Post()
  create(
    @Body() dto: CreateGoalDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    return this.goals.create(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    return this.goals.update(id, dto, admin, meta);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    return this.goals.activate(id, admin, meta);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    return this.goals.complete(id, admin, meta);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<GoalAdminResponse> {
    return this.goals.archive(id, admin, meta);
  }
}
