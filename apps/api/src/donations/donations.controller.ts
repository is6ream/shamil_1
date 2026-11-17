import { Body, Controller, Get, Header, Headers, Ip, Param, ParseUUIDPipe, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentDonor, DonorSessionGuard } from '../donor-auth/donor-session.guard';
import { DonorAuthFilter } from '../donor-auth/donor-auth.filter';
import type { VerifiedDonorIdentity } from '../recurring-contract/contract';
import { RecurringCheckoutDto } from '../recurring-contract/dto';
import { RecurringCheckoutService } from './recurring-checkout.service';
import { Throttle } from '@nestjs/throttler';

import { DONATION_THROTTLE_LIMIT, DONATION_THROTTLE_TTL_MS } from '../config/constants';
import { RecurringService } from '../payments/recurring/recurring.service';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import type {
  CreatedDonationResponse,
  DonationStatusResponse,
} from './dto/donation-response.dto';

@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService, private readonly recurring: RecurringService,
    private readonly checkoutService: RecurringCheckoutService) {}

  @Post('recurring/checkout')
  @UseGuards(DonorSessionGuard)
  @UseFilters(DonorAuthFilter)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async checkout(@CurrentDonor() owner: VerifiedDonorIdentity, @Headers('idempotency-key') key: string,
    @Body() dto: RecurringCheckoutDto, @Res({ passthrough: true }) response: Response) {
    const { replay, ...result } = await this.checkoutService.checkout(owner, key ?? '', dto);
    response.status(replay ? 200 : 201);
    return result;
  }

  @Get('capabilities')
  @Header('Cache-Control', 'no-store')
  capabilities() {
    return this.checkoutService.capabilities();
  }

  @Get('recurring')
  @Header('Cache-Control', 'no-store')
  recurringStatus(@Headers('authorization') authorization = '') {
    return this.recurring.manage(authorization.replace(/^Bearer /, ''), false);
  }

  @Post('recurring/cancel')
  @Header('Cache-Control', 'no-store')
  cancelRecurring(@Headers('authorization') authorization = '') {
    return this.recurring.manage(authorization.replace(/^Bearer /, ''), true);
  }

  /**
   * Создание заказа. Возвращает ссылку на оплату — статус доната этот ответ
   * не подтверждает и подтвердить не может: платёж подтверждает только вебхук.
   *
   * Лимит строже глобального: форма доната — публичная точка входа,
   * её перебирают ботами.
   */
  @Post()
  @Throttle({ default: { limit: DONATION_THROTTLE_LIMIT, ttl: DONATION_THROTTLE_TTL_MS } })
  create(
    @Body() dto: CreateDonationDto,
    // IP фиксируется как доказательство согласия на обработку ПДн (152-ФЗ),
    // хранится в donation_contact и в публичные выборки не попадает.
    @Ip() ip: string,
  ): Promise<CreatedDonationResponse> {
    return this.donations.create(dto, ip);
  }

  /**
   * Поллинг для страницы «спасибо»: 3 секунды × 10 попыток.
   * Редирект пользователя и колбэк провайдера — два независимых канала,
   * и редирект почти всегда быстрее.
   *
   * ParseUUIDPipe здесь не косметика: он отсекает перебор коротких id
   * до обращения к базе.
   */
  @Get(':id/status')
  getStatus(@Param('id', ParseUUIDPipe) id: string): Promise<DonationStatusResponse> {
    return this.donations.getStatus(id);
  }
}
