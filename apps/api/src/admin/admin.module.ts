import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PaymentsModule } from '../payments/payments.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { AdminDonationsListController } from './admin-donations-list.controller';
import { AdminDonationsQueryService } from './admin-donations-query.service';
import { AdminDonationsController } from './admin-donations.controller';
import { AdminDonationsService } from './admin-donations.service';
import { CampaignAdminController } from './campaign-admin.controller';
import { CampaignAdminService } from './campaign-admin.service';
import { ManualDonationService } from './manual-donation.service';

/**
 * Пожертвования и цели сбора в админке. Перевод `pending → paid` идёт через
 * `PaymentsService` — ту же машинерию, что и вебхук; ручное поступление
 * вставляется сразу в `paid`, витрины пересчитывает триггер БД.
 */
@Module({
  imports: [AuthCoreModule, AuditModule, PaymentsModule, RevalidationModule],
  controllers: [AdminDonationsController, AdminDonationsListController, CampaignAdminController],
  providers: [AdminDonationsService, AdminDonationsQueryService, ManualDonationService, CampaignAdminService],
})
export class AdminModule {}
