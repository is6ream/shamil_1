import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { BillingScheduler } from './billing.scheduler';
import { BillingService } from './billing.service';

/** Автосписания по расписанию. Состояние подписок после списания меняет `SubscriptionLifecycleService`. */
@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, PaymentsModule],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
