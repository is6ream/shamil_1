import { Body, Controller, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AUDIT_ROLES } from '../auth/roles';
import type { AuthRequest } from '../auth/auth.types';
import { RecurringService } from '../payments/recurring/recurring.service';

class ReconcileDto {
  @IsIn(['unknown_outcome', 'lost_callback', 'amount_review', 'support_request'])
  reason!: string;
}
@Controller('admin/recurring/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUDIT_ROLES)
export class RecurringReconciliationController {
  constructor(private readonly recurring: RecurringService, private readonly audit: AuditService) {}
  @Post(':id/reconcile') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async reconcile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileDto, @Req() request: AuthRequest) {
    if (!request.admin) throw new UnauthorizedException();
    // Durable intent precedes the query. Never store free-form operator text / XML / PII.
    await this.audit.record(undefined, { actor: userActor(request.admin), action: 'recurring.reconcile.requested',
      entityType: 'donation', entityId: id, after: { reason: dto.reason }, before: null });
    const result = await this.recurring.reconcileInvoice(id);
    await this.audit.record(undefined, { actor: userActor(request.admin), action: 'recurring.reconcile.completed',
      entityType: 'donation', entityId: id, after: { status: result.status }, before: null });
    return result;
  }
}
