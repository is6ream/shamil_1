import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { RevalidationModule } from '../revalidation/revalidation.module';
import { ActiveGoalService } from './active-goal.service';
import { FundraisingGoalsAdminController } from './fundraising-goals-admin.controller';
import { FundraisingGoalsRepository } from './fundraising-goals.repository';
import { FundraisingGoalsService } from './fundraising-goals.service';
import { GoalProgressCalculator } from './goal-progress.calculator';
import { PublicGoalsController } from './public-goals.controller';

/**
 * Этапы сбора («малые цели»): активный этап на первом экране главной
 * и управление этапами в админке.
 */
@Module({
  imports: [AuthCoreModule, AuditModule, RevalidationModule],
  controllers: [PublicGoalsController, FundraisingGoalsAdminController],
  providers: [FundraisingGoalsRepository, GoalProgressCalculator, ActiveGoalService, FundraisingGoalsService],
})
export class FundraisingGoalsModule {}
