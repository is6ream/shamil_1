import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { readRequestMeta } from '../auth/request-meta';
import { DONOR_THROTTLE, REQUEST_CODE_THROTTLE, VERIFY_CODE_THROTTLE } from '../donor-auth/donor-auth.constants';
import type { DonorPrincipal, DonorRequest } from '../donor-auth/donor-auth.types';
import { CurrentDonor, DonorJwtGuard } from '../donor-auth/donor-jwt.guard';
import { CodeRequestedResponse } from '../donor-auth/dto/donor-auth.dto';
import { DonorProfileService } from './donor-profile.service';
import {
  ChangeEmailConfirmDto,
  ChangeEmailRequestDto,
  DeleteAccountDto,
  DeleteChallengeResponse,
  DonorProfileResponse,
  DonorSummaryResponse,
  UpdateDonorProfileDto,
} from './dto/donor-profile.dto';

/** Профиль: всё под `DonorJwtGuard`, всё — только своё, `donorId` из сессии. */
@ApiTags('donor')
@ApiBearerAuth()
@Controller('donor/me')
@UseGuards(DonorJwtGuard)
@Throttle({ default: DONOR_THROTTLE })
export class DonorProfileController {
  constructor(private readonly profile: DonorProfileService) {}

  @Get()
  @ApiOkResponse({ type: DonorProfileResponse })
  me(@CurrentDonor() donor: DonorPrincipal): Promise<DonorProfileResponse> {
    return this.profile.profile(donor.id);
  }

  @Get('summary')
  @ApiOkResponse({ type: DonorSummaryResponse })
  summary(@CurrentDonor() donor: DonorPrincipal): Promise<DonorSummaryResponse> {
    return this.profile.summary(donor.id);
  }

  @Patch()
  @ApiOkResponse({ type: DonorProfileResponse })
  update(@CurrentDonor() donor: DonorPrincipal, @Body() dto: UpdateDonorProfileDto): Promise<DonorProfileResponse> {
    return this.profile.update(donor.id, dto);
  }

  @Post('email/request-code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: CodeRequestedResponse })
  async requestEmailChange(
    @CurrentDonor() donor: DonorPrincipal,
    @Body() dto: ChangeEmailRequestDto,
    @Req() request: DonorRequest,
  ): Promise<CodeRequestedResponse> {
    await this.profile.requestEmailChange(donor, dto.email, readRequestMeta(request));

    return { accepted: true };
  }

  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: VERIFY_CODE_THROTTLE })
  @ApiOkResponse({ type: DonorProfileResponse })
  confirmEmailChange(@CurrentDonor() donor: DonorPrincipal, @Body() dto: ChangeEmailConfirmDto): Promise<DonorProfileResponse> {
    return this.profile.confirmEmailChange(donor, dto.email, dto.code);
  }

  @Delete('vk')
  @ApiOkResponse({ type: DonorProfileResponse })
  unlinkVk(@CurrentDonor() donor: DonorPrincipal): Promise<DonorProfileResponse> {
    return this.profile.unlinkVk(donor.id);
  }

  @Post('delete/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: REQUEST_CODE_THROTTLE })
  @ApiOkResponse({ type: DeleteChallengeResponse })
  requestDeletion(@CurrentDonor() donor: DonorPrincipal, @Req() request: DonorRequest): Promise<DeleteChallengeResponse> {
    return this.profile.requestDeletion(donor, readRequestMeta(request));
  }

  @Post('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: VERIFY_CODE_THROTTLE })
  async delete(@CurrentDonor() donor: DonorPrincipal, @Body() dto: DeleteAccountDto): Promise<void> {
    await this.profile.delete(donor, dto.code);
  }
}
