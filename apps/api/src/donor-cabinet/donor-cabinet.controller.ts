import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { Page } from '../common/pagination';
import { DONOR_THROTTLE, REQUEST_CODE_THROTTLE } from '../donor-auth/donor-auth.constants';
import type { DonorPrincipal } from '../donor-auth/donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from '../donor-auth/donor-jwt.guard';
import { CancelByLinkDto, SubscriptionResponse, UpdateSubscriptionDto } from '../subscriptions/dto/subscription.dto';
import { SubscriptionLinksService } from '../subscriptions/subscription-links.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DonorCabinetService } from './donor-cabinet.service';
import {
  DonorDonationResponse,
  DonorDonationsPage,
  DonorDonationsQueryDto,
  DonorProfileResponse,
  UpdateDonorProfileDto,
} from './dto/donor-cabinet.dto';

/** Личный кабинет: всё под `DonorJwtGuard`, всё — только своё. */
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

  @Get('me')
  @ApiOkResponse({ type: DonorProfileResponse })
  me(@CurrentDonor() donor: DonorPrincipal): Promise<DonorProfileResponse> {
    return this.cabinet.profile(donor.id);
  }

  @Patch('me')
  @ApiOkResponse({ type: DonorProfileResponse })
  updateMe(@CurrentDonor() donor: DonorPrincipal, @Body() dto: UpdateDonorProfileDto): Promise<DonorProfileResponse> {
    return this.cabinet.updateProfile(donor.id, dto);
  }

  @Get('donations')
  @ApiOkResponse({ type: DonorDonationsPage })
  donations(
    @CurrentDonor() donor: DonorPrincipal,
    @Query() query: DonorDonationsQueryDto,
  ): Promise<Page<DonorDonationResponse>> {
    return this.cabinet.donations(donor.id, query);
  }

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
 * быть так же просто, как оформить их. Защита — HMAC в токене; ответ на чужой
 * или битый токен — 404, как у несуществующей подписки.
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
    const id = this.links.verifyCancelToken(dto.token);

    if (id === null) {
      throw new NotFoundException('Ссылка недействительна');
    }

    await this.subscriptions.cancel(id, 'link');

    return { cancelled: true };
  }
}
