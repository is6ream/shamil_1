import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DonorProfileController } from './donor-profile.controller';
import { DonorProfileService } from './donor-profile.service';

/** Карточка, настройки, почта, согласие на показ в ленте, удаление кабинета. */
@Module({
  imports: [DatabaseModule, DonorAuthModule, SubscriptionsModule],
  controllers: [DonorProfileController],
  providers: [DonorProfileService],
})
export class DonorProfileModule {}
