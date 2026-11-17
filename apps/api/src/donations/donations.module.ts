import { Module } from '@nestjs/common';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { RecurringCheckoutService } from './recurring-checkout.service';

import { AttributionModule } from '../attribution/attribution.module';
import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';

@Module({
  imports: [DatabaseModule, PaymentsModule, AttributionModule, DonorAuthModule],
  controllers: [DonationsController],
  providers: [DonationsService, RecurringCheckoutService],
  exports: [DonationsService],
})
export class DonationsModule {}
