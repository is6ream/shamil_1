import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';

@Module({
  imports: [DatabaseModule, PaymentsModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
