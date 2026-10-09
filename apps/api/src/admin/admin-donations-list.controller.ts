import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { DONATION_READ_ROLES, DONATION_WRITE_ROLES, EXPORT_ROLES } from '../auth/roles';
import type { Page } from '../common/pagination';
import { AdminDonationsQueryService } from './admin-donations-query.service';
import type { AdminDonationDetailResponse } from './admin-donations-query.service';
import type { AdminDonationResponse } from './donation-query';
import { DonationFiltersDto } from './dto/donation-list.dto';
import { ManualDonationDto } from './dto/manual-donation.dto';
import { ManualDonationService } from './manual-donation.service';
import type { ManualDonationResponse } from './manual-donation.service';

/** Имя файла выгрузки: дата по UTC достаточно для имени. */
function exportFileName(now: Date = new Date()): string {
  return `donations-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Пожертвования в админке: список, карточка, CSV, ручное поступление.
 * Подтверждение перевода — в `AdminDonationsController` (свой гард, D-07).
 */
@Controller('admin/donations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminDonationsListController {
  constructor(
    private readonly query: AdminDonationsQueryService,
    private readonly manual: ManualDonationService,
  ) {}

  @Get()
  @Roles(...DONATION_READ_ROLES)
  list(@Query() filters: DonationFiltersDto, @CurrentAdmin() admin: AdminPrincipal): Promise<Page<AdminDonationResponse>> {
    return this.query.list(filters, admin);
  }

  /**
   * CSV (UTF-8 с BOM, `;`) по тем же фильтрам, что и список, без постраничности.
   * Объявлен до `:id`, иначе `export.csv` разбирался бы как id.
   */
  @Get('export.csv')
  @Roles(...EXPORT_ROLES)
  async export(
    @Query() filters: DonationFiltersDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exportFileName()}"`);
    response.setHeader('Cache-Control', 'no-store');

    await this.query.exportCsv(filters, admin, meta, response);
  }

  @Get(':id')
  @Roles(...DONATION_READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminPrincipal): Promise<AdminDonationDetailResponse> {
    return this.query.get(id, admin);
  }

  /** Ручное поступление: наличные или перевод без заказа на сайте. Идемпотентно по ключу. */
  @Post('manual')
  @Roles(...DONATION_WRITE_ROLES)
  createManual(
    @Body() dto: ManualDonationDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ManualDonationResponse> {
    return this.manual.create(dto, admin, meta);
  }
}
