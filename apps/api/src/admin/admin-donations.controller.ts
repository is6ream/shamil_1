import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { API_TOKEN_ACTOR, userActor } from '../audit/audit.types';
import type { AuditActor } from '../audit/audit.types';
import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AuthRequest, RequestMeta } from '../auth/auth.types';
import { Roles } from '../auth/decorators';
import { JwtOrApiTokenGuard } from '../auth/guards/jwt-or-api-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { DONATION_WRITE_ROLES } from '../auth/roles';
import { AdminDonationsService } from './admin-donations.service';
import { ConfirmDonationDto } from './dto/confirm-donation.dto';
import type { ConfirmedDonationResponse } from './dto/admin-donation-response.dto';

/**
 * Подтверждение ручного перевода. Отдельный контроллер, потому что у маршрута
 * свой набор гардов: по D-07 он принимает и сессию админки, и старый
 * статический `ADMIN_API_TOKEN` — скрипты, написанные под токен, работают.
 */
@Controller('admin/donations')
@UseGuards(JwtOrApiTokenGuard, RolesGuard)
@Roles(...DONATION_WRITE_ROLES)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminDonationsController {
  constructor(private readonly donations: AdminDonationsService) {}

  /**
   * Деньги увидели в выписке — донат становится оплаченным и попадает в сумму
   * сбора и в рейтинг региона. Повторный вызов безопасен: подтверждение
   * идемпотентно по `manual:<invoiceNo>`.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDonationDto,
    @Req() request: AuthRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ConfirmedDonationResponse> {
    return this.donations.confirm(id, dto, actorOf(request), meta);
  }
}

function actorOf(request: AuthRequest): AuditActor {
  return request.admin === undefined ? API_TOKEN_ACTOR : userActor(request.admin);
}
