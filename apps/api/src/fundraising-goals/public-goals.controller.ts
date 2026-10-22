import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ActiveGoalService } from './active-goal.service';
import type { PublicActiveGoalResponse } from './dto/goal-response.dto';
import { PUBLIC_GOAL_THROTTLE } from './fundraising-goals.constants';

/**
 * Публичное чтение для первого экрана: `GET /api/public/goals/active`.
 * Без авторизации. Активного этапа нет — тело `null`, блок на сайте не рисуется.
 */
@Controller('public/goals')
@Throttle({ default: PUBLIC_GOAL_THROTTLE })
export class PublicGoalsController {
  constructor(private readonly activeGoal: ActiveGoalService) {}

  @Get('active')
  getActive(): Promise<PublicActiveGoalResponse | null> {
    return this.activeGoal.getActive();
  }
}
