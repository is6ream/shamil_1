import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CancelByLinkController, DonorCabinetController } from './donor-cabinet.controller';
import { DonorCabinetService } from './donor-cabinet.service';

@Module({
  imports: [DatabaseModule, DonorAuthModule, SubscriptionsModule],
  controllers: [DonorCabinetController, CancelByLinkController],
  providers: [DonorCabinetService],
})
export class DonorCabinetModule {}
