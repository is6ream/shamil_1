import { Module } from '@nestjs/common';

import { AttributionModule } from '../attribution/attribution.module';
import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { OptionalDonorReader } from './optional-donor.reader';

@Module({
  imports: [DatabaseModule, PaymentsModule, AttributionModule],
  controllers: [DonationsController],
  providers: [DonationsService, OptionalDonorReader],
  exports: [DonationsService],
})
export class DonationsModule {}
