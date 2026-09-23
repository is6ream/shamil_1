import { configuration } from './configuration';
import { NodeEnv, PaymentProviderCode, validateEnv } from './env.validation';

/**
 * Конфиг платежей проверяется тестом, а не доверием, по одной причине:
 * каждая ошибка здесь стоит денег и видна не сразу. Боевой сбор, молча ушедший
 * в тестовый режим провайдера, выглядит как работающий сайт — страница
 * «спасибо» показывается, а на счету пусто.
 */

/** Минимум, без которого не поднимается ничего, кроме платежей. */
const BASE_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: NodeEnv.Test,
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/shamil',
};

const ROBOKASSA_TEST_ENV: Readonly<Record<string, string>> = {
  ...BASE_ENV,
  PAYMENT_PROVIDER: PaymentProviderCode.Robokassa,
  PAYMENT_IS_TEST: 'true',
  PAYMENT_MERCHANT_ID: 'shamil_test',
  PAYMENT_TEST_SECRET_KEY: 'test-password-1',
  PAYMENT_TEST_WEBHOOK_SECRET: 'test-password-2',
};

describe('валидация окружения', () => {
  test('без DATABASE_URL приложение не поднимается', () => {
    // Act
    const act = (): unknown => validateEnv({ NODE_ENV: NodeEnv.Test });

    // Assert
    expect(act).toThrow(/DATABASE_URL/);
  });

  test('undefined не превращается в строку "undefined"', () => {
    // Arrange: enableImplicitConversion прогоняет значения через String(),
    // и если бы он не щадил undefined, отсутствующий секрет прошёл бы @IsString
    const act = (): unknown => validateEnv({ ...BASE_ENV, DATABASE_URL: undefined });

    // Assert
    expect(act).toThrow(/DATABASE_URL/);
  });

  test('manual не требует ни мерчанта, ни паролей', () => {
    // Act
    const env = validateEnv({ ...BASE_ENV, PAYMENT_PROVIDER: PaymentProviderCode.Manual });

    // Assert
    expect(env.PAYMENT_PROVIDER).toBe(PaymentProviderCode.Manual);
  });

  test('robokassa без явного режима не поднимается', () => {
    // Arrange: выбор между боевыми и тестовыми деньгами не достаётся молча
    const act = (): unknown =>
      validateEnv({
        ...BASE_ENV,
        PAYMENT_PROVIDER: PaymentProviderCode.Robokassa,
        PAYMENT_MERCHANT_ID: 'shamil',
      });

    // Assert
    expect(act).toThrow(/PAYMENT_IS_TEST/);
  });

  test('robokassa с пустыми боевыми паролями не поднимается', () => {
    // Act
    const act = (): unknown =>
      validateEnv({
        ...BASE_ENV,
        PAYMENT_PROVIDER: PaymentProviderCode.Robokassa,
        PAYMENT_IS_TEST: 'false',
        PAYMENT_MERCHANT_ID: 'shamil',
        PAYMENT_SECRET_KEY: '',
        PAYMENT_WEBHOOK_SECRET: '',
      });

    // Assert
    expect(act).toThrow(/PAYMENT_SECRET_KEY[\s\S]*PAYMENT_WEBHOOK_SECRET/);
  });

  test('robokassa в тестовом режиме не требует боевых паролей', () => {
    // Arrange & Act: мерчант проходит модерацию неделями, разработка ждать не может
    const env = validateEnv(ROBOKASSA_TEST_ENV);

    // Assert
    expect(env.PAYMENT_IS_TEST).toBe(true);
    expect(env.PAYMENT_SECRET_KEY).toBeUndefined();
  });

  test('PAYMENT_IS_TEST=0 читается как false, а не как непустая строка', () => {
    // Act
    const env = validateEnv({
      ...BASE_ENV,
      PAYMENT_PROVIDER: PaymentProviderCode.Robokassa,
      PAYMENT_IS_TEST: '0',
      PAYMENT_MERCHANT_ID: 'shamil',
      PAYMENT_SECRET_KEY: 'live-password-1',
      PAYMENT_WEBHOOK_SECRET: 'live-password-2',
    });

    // Assert
    expect(env.PAYMENT_IS_TEST).toBe(false);
  });

  test('непонятное значение флага роняет старт, а не подменяется дефолтом', () => {
    // Act
    const act = (): unknown => validateEnv({ ...ROBOKASSA_TEST_ENV, PAYMENT_IS_TEST: 'maybe' });

    // Assert
    expect(act).toThrow(/PAYMENT_IS_TEST/);
  });

  test('в production без ADMIN_API_TOKEN приложение не поднимается', () => {
    // Arrange: за админским токеном лежит подтверждение донатов — операция,
    // двигающая сумму сбора. На проде она не должна остаться без ключа
    const act = (): unknown =>
      validateEnv({ ...BASE_ENV, NODE_ENV: NodeEnv.Production });

    // Assert
    expect(act).toThrow(/ADMIN_API_TOKEN/);
  });

  test('короткий админский токен не принимается', () => {
    // Act
    const act = (): unknown =>
      validateEnv({ ...BASE_ENV, NODE_ENV: NodeEnv.Production, ADMIN_API_TOKEN: 'admin123' });

    // Assert
    expect(act).toThrow(/ADMIN_API_TOKEN/);
  });

  test('вне production токен необязателен — приложение стартует', () => {
    // Arrange & Act: локальная разработка не должна упираться в секрет;
    // открытым эндпоинт при этом не становится — гард отклоняет всё
    const env = validateEnv(BASE_ENV);

    // Assert
    expect(env.ADMIN_API_TOKEN).toBeUndefined();
  });

  test('включённая фискализация требует СНО, наименование позиции и ставку НДС', () => {
    // Act
    const act = (): unknown =>
      validateEnv({ ...ROBOKASSA_TEST_ENV, PAYMENT_RECEIPT_ENABLED: 'true' });

    // Assert
    expect(act).toThrow(/PAYMENT_RECEIPT_SNO/);
  });
});

describe('сборка конфига', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadWith(overrides: Readonly<Record<string, string>>): ReturnType<typeof configuration> {
    process.env = { ...overrides };

    return configuration();
  }

  test('в тестовом режиме активна тестовая пара паролей', () => {
    // Act
    const config = loadWith(ROBOKASSA_TEST_ENV);

    // Assert: дальше по коду существуют просто «пароль #1» и «пароль #2»
    expect(config.payment.secretKey).toBe('test-password-1');
    expect(config.payment.webhookSecret).toBe('test-password-2');
    expect(config.payment.isTest).toBe(true);
  });

  test('в боевом режиме активна боевая пара паролей', () => {
    // Act
    const config = loadWith({
      ...ROBOKASSA_TEST_ENV,
      PAYMENT_IS_TEST: 'false',
      PAYMENT_SECRET_KEY: 'live-password-1',
      PAYMENT_WEBHOOK_SECRET: 'live-password-2',
    });

    // Assert
    expect(config.payment.secretKey).toBe('live-password-1');
    expect(config.payment.webhookSecret).toBe('live-password-2');
  });

  test('хвостовой слеш в публичных адресах срезается', () => {
    // Act
    const config = loadWith({
      ...BASE_ENV,
      PUBLIC_API_URL: 'https://mechetshamil.ru/api/',
      PUBLIC_SITE_URL: 'https://mechetshamil.ru/',
    });

    // Assert
    expect(config.publicUrls.apiUrl).toBe('https://mechetshamil.ru/api');
    expect(config.publicUrls.siteUrl).toBe('https://mechetshamil.ru');
  });

  test('по умолчанию провайдер — ручной перевод, без секретов', () => {
    // Act
    const config = loadWith(BASE_ENV);

    // Assert
    expect(config.payment.provider).toBe(PaymentProviderCode.Manual);
    expect(config.payment.secretKey).toBe('');
    expect(config.payment.receipt.enabled).toBe(false);
  });
});
