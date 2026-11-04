import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { DatabaseModule } from '../database/database.module';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { AdminTaxCertificatesController, AdminTaxCertificatesService } from './admin-tax-certificates';
import { DonorDonationsController } from './donor-donations.controller';
import { DonorDonationsService } from './donor-donations.service';

/**
 * «Моя помощь» поверх существующих donation: история по годам и заявки на
 * справку для вычета, плюс раздел заявок в админке.
 */
@Module({
  imports: [DatabaseModule, DonorAuthModule, AuthCoreModule, AuditModule],
  controllers: [DonorDonationsController, AdminTaxCertificatesController],
  providers: [DonorDonationsService, AdminTaxCertificatesService],
})
export class DonorDonationsModule {}
