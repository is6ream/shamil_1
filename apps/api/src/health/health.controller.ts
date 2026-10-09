import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';
import { ReadinessService } from './readiness.service';
import type { ReadinessStatus } from './readiness.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly readiness: ReadinessService,
  ) {}

  /**
   * Проверка живости для Docker, Nginx и мониторинга.
   * Намеренно без обращений к БД: этот эндпоинт должен отвечать,
   * даже когда база недоступна, иначе оркестратор не отличит «сервис упал»
   * от «база моргнула».
   */
  @Get()
  check(): HealthStatus {
    return this.healthService.getStatus();
  }

  /** Готовность к трафику: БД и хранилище медиатеки. 503 — если что-то из них недоступно. */
  @Get('ready')
  ready(): Promise<ReadinessStatus> {
    return this.readiness.check();
  }
}
