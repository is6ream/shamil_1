import { ConfigService } from '@nestjs/config';

import type { AppConfig, MetrikaConfig } from '../../config/configuration';
import { ConversionEnqueueService } from '../conversion-enqueue.service';
import { YM_DEFAULT_OFFLINE_GOAL } from '../metrika.constants';

export const TEST_METRIKA_CONFIG: MetrikaConfig = {
  offlineEnabled: false,
  offlineGoal: YM_DEFAULT_OFFLINE_GOAL,
  intervalMs: 30 * 60 * 1000,
};

export function createMetrikaConfig(overrides: Partial<MetrikaConfig> = {}): ConfigService<AppConfig, true> {
  return new ConfigService<AppConfig, true>({ metrika: { ...TEST_METRIKA_CONFIG, ...overrides } });
}

/** Для тестов, создающих `PaymentsService` руками. */
export function createTestConversionEnqueue(): ConversionEnqueueService {
  return new ConversionEnqueueService(createMetrikaConfig());
}
