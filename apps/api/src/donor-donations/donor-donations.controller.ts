import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { DONOR_THROTTLE } from '../donor-auth/donor-auth.constants';
import type { DonorPrincipal } from '../donor-auth/donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from '../donor-auth/donor-jwt.guard';
import { DonorDonationsService } from './donor-donations.service';
import {
  CreateTaxCertificateDto,
  DonorHistoryQueryDto,
  DonorHistoryResponse,
  TaxCertificateResponse,
} from './dto/donor-donations.dto';

/** «Моя помощь»: свои пожертвования и справки. `donorId` — только из сессии. */
@ApiTags('donor')
@ApiBearerAuth()
@Controller('donor')
@UseGuards(DonorJwtGuard)
@Throttle({ default: DONOR_THROTTLE })
export class DonorDonationsController {
  constructor(private readonly donations: DonorDonationsService) {}

  @Get('donations')
  @ApiOkResponse({ type: DonorHistoryResponse })
  history(@CurrentDonor() donor: DonorPrincipal, @Query() query: DonorHistoryQueryDto): Promise<DonorHistoryResponse> {
    return this.donations.history(donor.id, query);
  }

  @Get('tax-certificates')
  @ApiOkResponse({ type: [TaxCertificateResponse] })
  certificates(@CurrentDonor() donor: DonorPrincipal): Promise<TaxCertificateResponse[]> {
    return this.donations.certificates(donor.id);
  }

  @Post('tax-certificates')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TaxCertificateResponse })
  request(@CurrentDonor() donor: DonorPrincipal, @Body() dto: CreateTaxCertificateDto): Promise<TaxCertificateResponse> {
    return this.donations.requestCertificate(donor.id, dto.year);
  }
}
