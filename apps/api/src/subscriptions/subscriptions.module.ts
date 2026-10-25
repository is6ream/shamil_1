import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DonorAuthModule } from '../donor-auth/donor-auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionLinksService } from './subscription-links.service';
import { SubscriptionNotifier } from './subscription-notifier.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Ежемесячные пожертвования: оформление, отмена, реакция на платежи.
 * Слушатель платежей регистрируется в `PaymentsService` при старте — платёжный
 * модуль о подписках не знает и от этого модуля не зависит.
 */
@Module({
  imports: [DatabaseModule, PaymentsModule, DonorAuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionLifecycleService, SubscriptionLinksService, SubscriptionNotifier],
  exports: [SubscriptionsService, SubscriptionLinksService, SubscriptionNotifier],
})
export class SubscriptionsModule {}
