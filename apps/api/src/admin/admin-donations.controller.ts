import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { AdminDonationsService } from './admin-donations.service';
import { AdminTokenGuard } from './admin-token.guard';
import { ConfirmDonationDto } from './dto/confirm-donation.dto';
import type { ConfirmedDonationResponse } from './dto/admin-donation-response.dto';

@Controller('admin/donations')
@UseGuards(AdminTokenGuard)
export class AdminDonationsController {
  constructor(private readonly donations: AdminDonationsService) {}

  /**
   * Подтверждение ручного перевода: деньги увидели в выписке — донат
   * становится оплаченным и попадает в сумму сбора и в рейтинг региона.
   *
   * Это вторая половина запасного пути оплаты. Без неё ManualProvider доводит
   * донатера до страницы реквизитов и на этом заканчивается, а все донаты
   * остаются в `pending` — то есть сбор показывает ноль при пришедших деньгах.
   *
   * `ParseUUIDPipe` отсекает мусорный id до обращения к базе. Повторный вызов
   * безопасен: подтверждение идемпотентно по `manual:<invoiceNo>`.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDonationDto,
  ): Promise<ConfirmedDonationResponse> {
    return this.donations.confirm(id, dto);
  }
}
