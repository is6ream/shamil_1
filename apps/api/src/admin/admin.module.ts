import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminDonationsController } from './admin-donations.controller';
import { AdminDonationsService } from './admin-donations.service';

/**
 * Пожертвования в админке. Перевод `pending → paid` идёт через `PaymentsService`
 * — ту же машинерию, что и вебхук; здесь маршруты, гарды и журнал.
 */
@Module({
  imports: [AuthCoreModule, AuditModule, PaymentsModule],
  controllers: [AdminDonationsController],
  providers: [AdminDonationsService],
})
export class AdminModule {}
