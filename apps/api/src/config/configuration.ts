import type { TaxationSystem, VatRate } from './constants';
import { NodeEnv, validateEnv } from './env.validation';
import type { EnvVars, PaymentHashAlgorithm, PaymentProviderCode } from './env.validation';

export interface HttpConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
}

export interface PublicUrlsConfig {
  /** Внешний адрес бэкенда — из него собирается Result URL для кабинета провайдера. */
  readonly apiUrl: string;
  /** Внешний адрес фронтенда — на него провайдер возвращает донатера. */
  readonly siteUrl: string;
}

/** Чек 54-ФЗ. Выключён, пока заказчик не подтвердил подключение Робочеков. */
export interface ReceiptConfig {
  readonly enabled: boolean;
  readonly taxationSystem?: TaxationSystem;
  readonly itemName?: string;
  readonly vat?: VatRate;
}

export interface PaymentConfig {
  readonly provider: PaymentProviderCode;
  readonly isTest: boolean;
  readonly hashAlgorithm: PaymentHashAlgorithm;
  readonly merchantId: string;
  /**
   * Пароль #1 активного режима — подпись исходящей ссылки.
   * Пару «боевой/тестовый» разбирает конфиг, а не провайдер: иначе выбор режима
   * размазался бы по коду подписи, где ошибиться дороже всего.
   */
  readonly secretKey: string;
  /** Пароль #2 активного режима — проверка подписи колбэка. */
  readonly webhookSecret: string;
  readonly receipt: ReceiptConfig;
}

export interface DatabaseConfig {
  readonly url: string;
}

export interface AdminConfig {
  /**
   * Статический токен админских эндпоинтов. Пустая строка — не «выключено»,
   * а «закрыто»: гард с пустым токеном не пропускает никого.
   */
  readonly apiToken: string;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly http: HttpConfig;
  readonly database: DatabaseConfig;
  readonly throttle: ThrottleConfig;
  readonly publicUrls: PublicUrlsConfig;
  readonly payment: PaymentConfig;
  readonly admin: AdminConfig;
}

function parseOrigins(value: string): readonly string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Хвостовой слеш ломает склейку URL: `…/api//donations` — уже другой маршрут. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Собирает платёжный блок конфига.
 *
 * Ключевое решение: активная пара паролей выбирается здесь, по `isTest`.
 * Дальше по коду существуют просто «пароль #1» и «пароль #2» — провайдер
 * не знает про тестовый режим ничего, кроме флага `IsTest` в ссылке.
 *
 * У `manual` секретов нет вовсе: ручной перевод по реквизитам ничего не
 * подписывает. Пустые строки здесь безопасны — валидация окружения уже
 * гарантировала, что для `robokassa` активная пара заполнена.
 */
function buildPaymentConfig(env: EnvVars): PaymentConfig {
  const isTest = env.PAYMENT_IS_TEST ?? true;

  return {
    provider: env.PAYMENT_PROVIDER,
    isTest,
    hashAlgorithm: env.PAYMENT_HASH_ALGORITHM,
    merchantId: env.PAYMENT_MERCHANT_ID ?? '',
    secretKey: (isTest ? env.PAYMENT_TEST_SECRET_KEY : env.PAYMENT_SECRET_KEY) ?? '',
    webhookSecret: (isTest ? env.PAYMENT_TEST_WEBHOOK_SECRET : env.PAYMENT_WEBHOOK_SECRET) ?? '',
    receipt: {
      enabled: env.PAYMENT_RECEIPT_ENABLED,
      taxationSystem: env.PAYMENT_RECEIPT_SNO,
      itemName: env.PAYMENT_RECEIPT_ITEM_NAME,
      vat: env.PAYMENT_RECEIPT_VAT,
    },
  };
}

/**
 * Единственное место, где читается `process.env`.
 * Остальной код берёт значения из ConfigService — типизированно и уже проверенными.
 */
export function configuration(): AppConfig {
  const env = validateEnv(process.env as Record<string, unknown>);

  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === NodeEnv.Production,
    http: {
      port: env.API_PORT,
      corsOrigins: parseOrigins(env.CORS_ORIGINS),
    },
    database: {
      url: env.DATABASE_URL,
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS,
      limit: env.THROTTLE_LIMIT,
    },
    publicUrls: {
      apiUrl: trimTrailingSlash(env.PUBLIC_API_URL),
      siteUrl: trimTrailingSlash(env.PUBLIC_SITE_URL),
    },
    payment: buildPaymentConfig(env),
    admin: {
      // Вне production переменной может не быть — и это не повод пропускать
      // запросы: пустой токен гард трактует как «закрыто наглухо».
      apiToken: env.ADMIN_API_TOKEN ?? '',
    },
  };
}
