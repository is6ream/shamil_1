import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ReqMeta } from '../auth/request-meta';
import type { RequestMeta } from '../auth/auth.types';
import { DONATION_THROTTLE_LIMIT, DONATION_THROTTLE_TTL_MS } from '../config/constants';
import type { DonorPrincipal } from '../donor-auth/donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from '../donor-auth/donor-jwt.guard';
import { CreateSubscriptionDto, CreatedSubscriptionResponse } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Оформление ежемесячного пожертвования. Только для вошедших: подпиской
 * нужно управлять (пауза, сумма, отмена), а без кабинета этого некуда положить.
 * Разовый донат по-прежнему идёт через `POST /donations` без входа.
 */
@ApiTags('donor')
@ApiBearerAuth()
@Controller('donor/subscriptions')
@UseGuards(DonorJwtGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: DONATION_THROTTLE_LIMIT, ttl: DONATION_THROTTLE_TTL_MS } })
  @ApiOkResponse({ type: CreatedSubscriptionResponse })
  create(
    @CurrentDonor() donor: DonorPrincipal,
    @Body() dto: CreateSubscriptionDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<CreatedSubscriptionResponse> {
    return this.subscriptions.create(donor, dto, meta.ip ?? undefined);
  }
}
