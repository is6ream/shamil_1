import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import { CurrentDonor, DonorSessionGuard } from '../../donor-auth/donor-session.guard';
import { DonorAuthFilter } from '../../donor-auth/donor-auth.filter';
import { donorError } from '../../donor-auth/donor-auth.errors';
import type { VerifiedDonorIdentity } from '../../recurring-contract/contract';
import { ClaimLegacyDto } from '../../recurring-contract/dto';
import { RecurringManagementService } from './recurring-management.service';

@Controller('donor/subscriptions')
@UseGuards(DonorSessionGuard)
@UseFilters(DonorAuthFilter)
export class RecurringManagementController {
  constructor(private readonly service: RecurringManagementService) {}
  @Get() @Header('Cache-Control', 'no-store') @Header('Referrer-Policy', 'no-referrer')
  list(@CurrentDonor() donor: VerifiedDonorIdentity, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.service.list(donor.donorId, cursor, limit); }
  @Post('claim') @HttpCode(200) @Header('Cache-Control', 'no-store') @Header('Referrer-Policy', 'no-referrer')
  claim(@CurrentDonor() donor: VerifiedDonorIdentity, @Body() dto: ClaimLegacyDto) { return this.service.claim(donor.donorId, dto.legacyKey); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@CurrentDonor() donor: VerifiedDonorIdentity, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(donor.donorId, id); }
  @Get(':id/history') @Header('Cache-Control', 'no-store')
  history(@CurrentDonor() donor: VerifiedDonorIdentity, @Param('id', ParseUUIDPipe) id: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.service.history(donor.donorId, id, cursor, limit); }
  @Post(':id/cancel') @HttpCode(200) @Header('Cache-Control', 'no-store')
  cancel(@CurrentDonor() donor: VerifiedDonorIdentity, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) throw donorError(400, 'VALIDATION_ERROR', 'Тело запроса должно быть пустым');
    return this.service.cancel(donor.donorId, id);
  }
}
