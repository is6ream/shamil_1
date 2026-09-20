import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    // Arrange
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get(HealthController);
  });

  test('возвращает статус ok', () => {
    // Act
    const result = controller.check();

    // Assert
    expect(result.status).toBe('ok');
  });

  test('возвращает аптайм в целых секундах', () => {
    // Act
    const result = controller.check();

    // Assert
    expect(Number.isInteger(result.uptimeSeconds)).toBe(true);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test('возвращает отметку времени в формате ISO', () => {
    // Act
    const result = controller.check();

    // Assert
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
