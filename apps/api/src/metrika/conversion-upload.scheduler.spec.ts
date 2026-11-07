import { ConversionUploadScheduler } from './conversion-upload.scheduler';
import type { ConversionUploadService, UploadRunSummary } from './conversion-upload.service';
import { createMetrikaApi } from './metrika.module';
import { HttpMetrikaApi } from './metrika-api';
import { createMetrikaConfig } from './testing/metrika-test-config';

const EMPTY_SUMMARY: UploadRunSummary = {
  expired: 0,
  reclaimed: 0,
  uploaded: 0,
  retried: 0,
  failed: 0,
  processed: 0,
  linkageFailed: 0,
};

function uploadsStub(run: () => Promise<UploadRunSummary>): ConversionUploadService {
  return { runOnce: jest.fn(run) } as unknown as ConversionUploadService;
}

describe('ConversionUploadScheduler', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('выгрузка выключена — таймер не заводится', () => {
    // Arrange
    jest.useFakeTimers();
    const uploads = uploadsStub(() => Promise.resolve(EMPTY_SUMMARY));
    const scheduler = new ConversionUploadScheduler(uploads, createMetrikaConfig({ offlineEnabled: false }));

    // Act
    scheduler.onApplicationBootstrap();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    // Assert
    expect(uploads.runOnce).not.toHaveBeenCalled();
  });

  test('включена — проход раз в интервал, после destroy таймер остановлен', () => {
    // Arrange
    jest.useFakeTimers();
    const uploads = uploadsStub(() => Promise.resolve(EMPTY_SUMMARY));
    const scheduler = new ConversionUploadScheduler(
      uploads,
      createMetrikaConfig({ offlineEnabled: true, intervalMs: 60_000 }),
    );

    // Act
    scheduler.onApplicationBootstrap();
    jest.advanceTimersByTime(60_000);
    scheduler.onModuleDestroy();
    jest.advanceTimersByTime(10 * 60_000);

    // Assert
    expect(uploads.runOnce).toHaveBeenCalledTimes(1);
  });

  test('проход не накладывается на незавершённый', async () => {
    // Arrange
    let finish: (summary: UploadRunSummary) => void = () => undefined;
    const uploads = uploadsStub(() => new Promise((resolve) => (finish = resolve)));
    const scheduler = new ConversionUploadScheduler(uploads, createMetrikaConfig());

    // Act
    const first = scheduler.tick();
    await scheduler.tick();
    finish(EMPTY_SUMMARY);
    await first;
    const third = scheduler.tick();
    finish(EMPTY_SUMMARY);
    await third;

    // Assert
    expect(uploads.runOnce).toHaveBeenCalledTimes(2);
  });

  test('ошибка прохода не выходит наружу', async () => {
    // Arrange
    const failing = new ConversionUploadScheduler(
      uploadsStub(() => Promise.reject(new Error('база недоступна'))),
      createMetrikaConfig(),
    );
    const failingWithString = new ConversionUploadScheduler(
      uploadsStub(() => Promise.reject('timeout')),
      createMetrikaConfig(),
    );

    // Act + Assert
    await expect(failing.tick()).resolves.toBeUndefined();
    await expect(failingWithString.tick()).resolves.toBeUndefined();
  });
});

describe('createMetrikaApi', () => {
  test('выключено или нет токена — адаптера нет', () => {
    expect(createMetrikaApi(createMetrikaConfig({ offlineEnabled: false, counterId: 1, oauthToken: 't' }))).toBeNull();
    expect(createMetrikaApi(createMetrikaConfig({ offlineEnabled: true, counterId: 1 }))).toBeNull();
  });

  test('включено с номером и токеном — HTTP-адаптер', () => {
    const api = createMetrikaApi(
      createMetrikaConfig({ offlineEnabled: true, counterId: 1, oauthToken: 'x'.repeat(30) }),
    );

    expect(api).toBeInstanceOf(HttpMetrikaApi);
  });
});
