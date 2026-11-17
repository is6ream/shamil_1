import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { DONOR_AUTH_OPTIONS, DONOR_IDENTITY } from '../recurring-contract/contract';
import { DonorAuthService } from './donor-auth.service';
import { DonorAuthController } from './donor-auth.controller';
import { DonorSessionGuard } from './donor-session.guard';
import { DonorIpLimiter } from './donor-ip-limiter';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [DonorAuthController],
  providers: [DonorAuthService, DonorIpLimiter, DonorSessionGuard,
    { provide: DONOR_IDENTITY, useExisting: DonorAuthService },
    { provide: DONOR_AUTH_OPTIONS, inject: [ConfigService], useFactory: (config: ConfigService) => ({
      codeHmacSecret: config.get<string>('donor.codeHmacSecret') ?? '', sessionTtlMs: 2_592_000_000,
    }) },
  ],
  exports: [DonorAuthService, DonorSessionGuard, DONOR_IDENTITY],
})
export class DonorAuthModule {}
