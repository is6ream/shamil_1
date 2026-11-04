import {
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { DONOR_THROTTLE, REQUEST_CODE_THROTTLE } from '../donor-auth/donor-auth.constants';
import type { DonorPrincipal } from '../donor-auth/donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from '../donor-auth/donor-jwt.guard';
import { CancelByLinkDto, SubscriptionResponse, UpdateSubscriptionDto } from '../subscriptions/dto/subscription.dto';
import { SubscriptionLinksService } from '../subscriptions/subscription-links.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DonorCabinetService } from './donor-cabinet.service';

/** Подписки в кабинете: всё под `DonorJwtGuard`, всё — только своё. Профиль — `DonorProfileModule`. */
@ApiTags('donor')
@ApiBearerAuth()
@Controller('donor')
@UseGuards(DonorJwtGuard)
@Throttle({ default: DONOR_THROTTLE })
export class DonorCabinetController {
  constructor(
    private readonly cabinet: DonorCabinetService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('subscriptions')
  @ApiOkResponse({ type: [SubscriptionResponse] })
  list(@CurrentDonor() donor: DonorPrincipal): Promise<SubscriptionResponse[]> {
    return this.cabinet.subscriptions(donor.id);
  }

  @Get('subscriptions/:id')
  @ApiOkResponse({ type: SubscriptionResponse })
  one(@CurrentDonor() donor: DonorPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<SubscriptionResponse> {
    return this.cabinet.subscription(donor.id, id);
  }

  @Patch('subscriptions/:id')
  @ApiOkResponse({ type: SubscriptionResponse })
  update(
    @CurrentDonor() donor: DonorPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.cabinet.updateSubscription(donor.id, id, dto);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SubscriptionResponse })
  async cancel(
    @CurrentDonor() donor: DonorPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionResponse> {
    await this.subscriptions.cancel(id, 'donor', { ownerId: donor.id });

    return this.cabinet.subscription(donor.id, id);
  }
}

class CancelledResponse {
  @ApiProperty()
  readonly cancelled!: boolean;
}

/**
 * Отмена по ссылке из письма — без входа: отказаться от автосписаний должно
 * быть так же просто, как оформить их. Защита — HMAC и срок в токене; ответ
 * на чужой или битый токен — 404, как у несуществующей подписки; на истёкший
 * настоящий — 410, чтобы фронт предложил отменить в кабинете.
 * Повторное нажатие — тот же 200: отмена идемпотентна.
 */
@ApiTags('donor')
@Controller('donor/subscriptions')
export class CancelByLinkController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly links: SubscriptionLinksService,
  ) {}

  @Post('cancel-by-link')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: CancelledResponse })
  async cancelByLink(@Body() dto: CancelByLinkDto): Promise<CancelledResponse> {
    const check = this.links.checkCancelToken(dto.token);

    if (check.kind === 'invalid') {
      throw new NotFoundException('Ссылка недействительна');
    }

    if (check.kind === 'expired') {
      throw new GoneException('Срок ссылки истёк — отменить пожертвование можно в личном кабинете');
    }

    await this.subscriptions.cancel(check.subscriptionId, 'link');

    return { cancelled: true };
  }
}
