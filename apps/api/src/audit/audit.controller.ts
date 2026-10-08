import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AUDIT_ROLES } from '../auth/roles';
import type { Page } from '../common/pagination';
import { AuditQueryService } from './audit-query.service';
import type { AuditLogItemResponse } from './audit-query.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUDIT_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  list(@Query() query: AuditQueryDto): Promise<Page<AuditLogItemResponse>> {
    return this.audit.list(query);
  }
}
