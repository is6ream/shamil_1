import { Body, Controller, Get, Header, HttpCode, Post, Req, Optional, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { donorClientIp, signedDonorClientIp } from './donor-client-ip';
import type { Request } from 'express';
import { RequestEmailCodeDto, VerifyEmailCodeDto } from '../recurring-contract/dto';
import type { DonorSessionView, EmailCodeRequested, VerifiedEmailSession } from '../recurring-contract/contract';
import { DonorAuthService } from './donor-auth.service';
import { DonorAuthFilter } from './donor-auth.filter';
import { DonorSessionGuard, readDonorBearer } from './donor-session.guard';
import { authRequired, donorError } from './donor-auth.errors';

/** API-to-BFF bearer endpoints. No cookie handling here; BFF owns Origin/CSRF policy. */
@Controller('donor/auth')
@UseFilters(DonorAuthFilter)
export class DonorAuthController {
  constructor(private readonly auth: DonorAuthService, @Optional() private readonly config?: ConfigService) {}

  @Post('request-code')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  requestCode(@Body() dto: RequestEmailCodeDto, @Req() request: Request): Promise<EmailCodeRequested> {
    return this.auth.requestCode(dto.email, this.ip(request, 'request-code'));
  }

  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  verify(@Body() dto: VerifyEmailCodeDto, @Req() request: Request): Promise<VerifiedEmailSession> {
    return this.auth.verify(dto.challengeId, dto.code, this.ip(request, 'verify'));
  }

  @Get('session')
  @UseGuards(DonorSessionGuard)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  session(@Req() request: Request): Promise<DonorSessionView> {
    const token = readDonorBearer(request);
    if (!token) throw authRequired();
    return this.auth.session(token);
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async logout(@Req() request: Request, @Body() body: unknown): Promise<void> {
    if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0)) {
      throw donorError(400, 'VALIDATION_ERROR', 'Тело запроса должно быть пустым');
    }
    await this.auth.logout(readDonorBearer(request));
  }

  private ip(request: Request, action: 'request-code' | 'verify'): string {
    const signed = signedDonorClientIp(request.headers['x-shamil-donor-ip'], 'donor/auth/' + action, this.config?.get<string>('donor.ipForwardingSecret'));
    if (signed) return signed;
    return donorClientIp(request, this.config?.get<readonly string[]>('http.trustedProxyCidrs') ?? []);
  }
}
