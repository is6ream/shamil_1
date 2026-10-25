import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionsService } from './admin-subscriptions.service';

@Module({
  imports: [AuthCoreModule, AuditModule, SubscriptionsModule],
  controllers: [AdminSubscriptionsController],
  providers: [AdminSubscriptionsService],
})
export class AdminSubscriptionsModule {}
