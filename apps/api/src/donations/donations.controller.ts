import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { DONATION_THROTTLE_LIMIT, DONATION_THROTTLE_TTL_MS } from '../config/constants';
import type { DonorRequest } from '../donor-auth/donor-auth.types';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { OptionalDonorReader } from './optional-donor.reader';
import type {
  CreatedDonationResponse,
  DonationStatusResponse,
} from './dto/donation-response.dto';

@Controller('donations')
export class DonationsController {
  constructor(
    private readonly donations: DonationsService,
    private readonly donors: OptionalDonorReader,
  ) {}

  /**
   * Создание заказа. Возвращает ссылку на оплату — статус доната этот ответ
   * не подтверждает и подтвердить не может: платёж подтверждает только вебхук.
   *
   * Лимит строже глобального: форма доната — публичная точка входа,
   * её перебирают ботами.
   *
   * Вошедший в кабинет шлёт свой Bearer — донат попадёт в «Мою помощь».
   * Без входа всё как раньше.
   */
  @Post()
  @Throttle({ default: { limit: DONATION_THROTTLE_LIMIT, ttl: DONATION_THROTTLE_TTL_MS } })
  async create(
    @Body() dto: CreateDonationDto,
    // IP фиксируется как доказательство согласия на обработку ПДн (152-ФЗ),
    // хранится в donation_contact и в публичные выборки не попадает.
    @Ip() ip: string,
    @Req() request: DonorRequest,
  ): Promise<CreatedDonationResponse> {
    return this.donations.create(dto, ip, await this.donors.donorId(request));
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
