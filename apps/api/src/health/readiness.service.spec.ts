import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import type { StorageDriver } from '../media/storage/storage.types';
import { READINESS_CHECK_TIMEOUT_MS, ReadinessService } from './readiness.service';

function storage(ping: () => Promise<void>): StorageDriver {
  return { name: 's3', put: jest.fn(), remove: jest.fn(), publicUrl: (key) => key, ping };
}

function prisma(query: () => Promise<unknown>): PrismaService {
  return { $queryRaw: () => query() } as unknown as PrismaService;
}

describe('готовность к трафику', () => {
  test('БД и бакет отвечают — ok', async () => {
    // Arrange
    const service = new ReadinessService(prisma(async () => [1]), storage(async () => undefined));

    // Act
    const status = await service.check();

    // Assert
    expect(status).toEqual({ status: 'ok', checks: { database: 'ok', storage: 'ok' }, storageDriver: 's3' });
  });

  test('бакет недоступен — 503, текст ошибки наружу не уходит', async () => {
    // Arrange
    const service = new ReadinessService(
      prisma(async () => [1]),
      storage(async () => {
        throw new Error('AccessDenied for secret-bucket.internal');
      }),
    );

    // Act
    const act = service.check();

    // Assert
    await expect(act).rejects.toThrow(ServiceUnavailableException);
    await act.catch((error: unknown) => {
      const body = JSON.stringify((error as ServiceUnavailableException).getResponse());

      expect(body).toContain('"storage":"fail"');
      expect(body).not.toContain('secret-bucket');
    });
  });

  test('зависшая БД не держит ответ дольше таймаута', async () => {
    // Arrange
    jest.useFakeTimers();
    const service = new ReadinessService(prisma(() => new Promise(() => undefined)), storage(async () => undefined));

    // Act
    const act = service.check();
    jest.advanceTimersByTime(READINESS_CHECK_TIMEOUT_MS + 1);

    // Assert
    await expect(act).rejects.toThrow(ServiceUnavailableException);
    jest.useRealTimers();
  });
});
