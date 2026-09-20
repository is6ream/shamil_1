import { Controller, Get } from '@nestjs/common';

import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}
