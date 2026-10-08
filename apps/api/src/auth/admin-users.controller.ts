import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AdminUsersService } from './admin-users.service';
import type { AdminUserResponse } from './admin-users.service';
import { ADMIN_THROTTLE } from './auth.constants';
import type { AdminPrincipal, RequestMeta } from './auth.types';
import { CurrentAdmin, Roles } from './decorators';
import { CreateAdminUserDto, ResetPasswordDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ReqMeta } from './request-meta';
import { USERS_ROLES } from './roles';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...USERS_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(): Promise<readonly AdminUserResponse[]> {
    return this.users.list();
  }

  @Post()
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminUserResponse> {
    return this.users.create(dto, admin, meta);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminUserResponse> {
    return this.users.update(id, dto, admin, meta);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.users.resetPassword(id, dto, admin, meta);
  }
}
