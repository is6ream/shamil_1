import { Module } from '@nestjs/common';

import { AuthCoreModule } from '../auth/auth-core.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/** Отчёты админки по атрибуции донатов. */
@Module({
  imports: [AuthCoreModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
