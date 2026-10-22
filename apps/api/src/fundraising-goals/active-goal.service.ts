import { Injectable } from '@nestjs/common';

import { ACTIVE_GOAL_CACHE_TTL_MS } from './fundraising-goals.constants';
import { FundraisingGoalsRepository } from './fundraising-goals.repository';
import { GoalProgressCalculator } from './goal-progress.calculator';
import { toPublicGoal } from './dto/goal-response.dto';
import type { PublicActiveGoalResponse } from './dto/goal-response.dto';

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: Promise<PublicActiveGoalResponse | null>;
}

/**
 * Активный этап для главной с кешем в памяти процесса.
 *
 * В кеше лежит промис, а не значение: пачка одновременных запросов после
 * истечения кеша делает один запрос в базу, а не по одному на каждого.
 * Упавший запрос из кеша убирается сразу — ошибка не живёт 30 секунд.
 *
 * Кеш на процесс: у API на App Platform один инстанс. При нескольких
 * инстансах правка в админке сбросит кеш только у одного, остальные
 * догонят за `ACTIVE_GOAL_CACHE_TTL_MS`.
 */
@Injectable()
export class ActiveGoalService {
  private cache: CacheEntry | null = null;

  constructor(
    private readonly goals: FundraisingGoalsRepository,
    private readonly calculator: GoalProgressCalculator,
  ) {}

  getActive(now: number = Date.now()): Promise<PublicActiveGoalResponse | null> {
    if (this.cache !== null && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const value = this.load();
    const entry: CacheEntry = { expiresAt: now + ACTIVE_GOAL_CACHE_TTL_MS, value };

    this.cache = entry;
    value.catch(() => {
      if (this.cache === entry) {
        this.cache = null;
      }
    });

    return value;
  }

  /** После любой правки этапа: следующий запрос пойдёт в базу. */
  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<PublicActiveGoalResponse | null> {
    const goal = await this.goals.findActive();

    if (goal === null) {
      return null;
    }

    return toPublicGoal(goal, await this.calculator.progressOf(goal));
  }
}
