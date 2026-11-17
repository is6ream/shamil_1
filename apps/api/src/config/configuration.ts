import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { resolve as resolvePath } from 'node:path';
import type { TaxationSystem, VatRate } from './constants';
import type { DonorSmtpOptions } from '../mail/smtp-mail.sender';
import type { RecurringOptions } from '../recurring-contract/contract';
import { NodeEnv, StorageDriver, validateEnv } from './env.validation';
import type { DeployStage, EnvVars, PaymentHashAlgorithm, PaymentProviderCode } from './env.validation';

export interface HttpConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly trustedProxyCidrs?: readonly string[];
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
  readonly onlineOrdersEnabled: boolean;
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
  /** Страница оплаты: боевая Robokassa или локальный эмулятор. */
  readonly paymentUrl: string;
  /** Локальный эмулятор оплаты. В production выключен валидацией (кроме демо-стенда). */
  readonly emulatorEnabled: boolean;
  /**
   * HMAC-ключ ссылок сценариев эмулятора. `undefined` — ключ случайный на запуск
   * процесса: локально достаточно, в serverless ссылки не переживут холодный старт.
   */
  readonly emulatorLinkSecret?: string;
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

export interface AdminAuthConfig {
  /**
   * Ключ подписи access-JWT. Без `ADMIN_JWT_SECRET` (разрешено только вне
   * production) — случайный на запуск процесса.
   */
  readonly jwtSecret: string;
  readonly cookieSecure: boolean;
}

export interface S3StorageConfig {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl: string;
  readonly forcePathStyle: boolean;
}

export interface MediaConfig {
  readonly driver: StorageDriver;
  /** Абсолютный путь каталога медиатеки для `local`. */
  readonly localDir: string;
  /**
   * Адрес, от которого строятся публичные ссылки на файлы: у `s3` — бакет
   * (`S3_PUBLIC_BASE_URL`), у `local` — `MEDIA_PUBLIC_URL` или `${PUBLIC_API_URL}/media`.
   */
  readonly publicUrl: string;
  readonly maxUploadBytes: number;
  readonly s3?: S3StorageConfig;
}

export interface RevalidationConfig {
  /** `undefined` — ревалидация выключена. */
  readonly secret?: string;
  /** Route handler Next.js: `${PUBLIC_SITE_URL}/api/revalidate`. */
  readonly url: string;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

/** Офлайн-конверсии Яндекс Метрики. */
export interface MetrikaConfig {
  /** Выключено — очередь копится, но в Метрику ничего не уходит. */
  readonly offlineEnabled: boolean;
  /** `undefined` только при выключенной выгрузке — это гарантирует валидация. */
  readonly counterId?: number;
  readonly oauthToken?: string;
  readonly offlineGoal: string;
  readonly intervalMs: number;
}

export interface AppConfig {
  readonly donor?: { readonly codeHmacSecret: string; readonly ipForwardingSecret?: string; readonly smtp?: DonorSmtpOptions };
  readonly recurring?: RecurringOptions;
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly deployStage: DeployStage;
  readonly http: HttpConfig;
  readonly database: DatabaseConfig;
  readonly throttle: ThrottleConfig;
  readonly publicUrls: PublicUrlsConfig;
  readonly payment: PaymentConfig;
  readonly admin: AdminConfig;
  readonly adminAuth: AdminAuthConfig;
  readonly media: MediaConfig;
  readonly revalidation: RevalidationConfig;
  readonly metrika: MetrikaConfig;
}

const BYTES_IN_MB = 1024 * 1024;
const MINUTE_MS = 60 * 1000;

/** Публичный путь, под которым Nest отдаёт каталог медиатеки (`local`). */
export const MEDIA_ROUTE_PREFIX = '/media';

/** Маршрут ревалидации во фронтенде. */
const REVALIDATE_PATH = '/api/revalidate';

/**
 * Случайный ключ JWT на запуск процесса — только вне production, это уже
 * гарантировала валидация окружения. Генерируется один раз на процесс:
 * `configuration()` вызывается при каждом создании модуля конфига в тестах,
 * и разные ключи в одном процессе ломали бы проверку только что выданного токена.
 */
let processJwtSecret: string | undefined;

function ephemeralJwtSecret(): string {
  processJwtSecret ??= randomBytes(32).toString('hex');

  return processJwtSecret;
}

function buildMediaConfig(env: EnvVars, apiUrl: string): MediaConfig {
  const s3 =
    env.STORAGE_DRIVER === StorageDriver.S3
      ? {
          bucket: env.S3_BUCKET ?? '',
          region: env.S3_REGION ?? '',
          endpoint: env.S3_ENDPOINT ?? '',
          accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
          publicBaseUrl: trimTrailingSlash(env.S3_PUBLIC_BASE_URL ?? ''),
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        }
      : undefined;

  return {
    driver: env.STORAGE_DRIVER,
    localDir: resolvePath(env.MEDIA_LOCAL_DIR),
    publicUrl:
      s3?.publicBaseUrl ?? trimTrailingSlash(env.MEDIA_PUBLIC_URL ?? `${apiUrl}${MEDIA_ROUTE_PREFIX}`),
    maxUploadBytes: env.MEDIA_MAX_UPLOAD_MB * BYTES_IN_MB,
    s3,
  };
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
    onlineOrdersEnabled: env.PAYMENT_ONLINE_ORDERS_ENABLED,
    isTest,
    hashAlgorithm: env.PAYMENT_HASH_ALGORITHM,
    merchantId: env.PAYMENT_MERCHANT_ID ?? '',
    secretKey: (isTest ? env.PAYMENT_TEST_SECRET_KEY : env.PAYMENT_SECRET_KEY) ?? '',
    webhookSecret: (isTest ? env.PAYMENT_TEST_WEBHOOK_SECRET : env.PAYMENT_WEBHOOK_SECRET) ?? '',
    paymentUrl: env.PAYMENT_ROBOKASSA_URL,
    emulatorEnabled: env.PAYMENT_EMULATOR_ENABLED,
    emulatorLinkSecret: env.PAYMENT_EMULATOR_LINK_SECRET,
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
  const isProduction = env.NODE_ENV === NodeEnv.Production;
  const apiUrl = trimTrailingSlash(env.PUBLIC_API_URL);
  const siteUrl = trimTrailingSlash(env.PUBLIC_SITE_URL);
  const candidates = env.DONOR_TRUSTED_PROXY_CIDRS?.split(',').map((value) => value.trim()) ?? [];
  const proxyCidrs = candidates.length && candidates.every((value) => {
    const [ip, prefix, extra] = value.split('/');
    const family = isIP(ip ?? '');
    return family !== 0 && !ip?.includes('%') && prefix !== undefined && extra === undefined && /^\d{1,3}$/.test(prefix)
      && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128);
  }) ? candidates : undefined;

  return {
    nodeEnv: env.NODE_ENV,
    donor: {
      codeHmacSecret: env.DONOR_CODE_HMAC_SECRET ?? '',
      ipForwardingSecret: env.DONOR_IP_FORWARDING_SECRET,
      smtp: env.DONOR_SMTP_HOST && env.DONOR_SMTP_USER && env.DONOR_SMTP_PASS && env.DONOR_SMTP_FROM ? {
        host: env.DONOR_SMTP_HOST, port: env.DONOR_SMTP_PORT, secure: env.DONOR_SMTP_SECURE,
        user: env.DONOR_SMTP_USER, pass: env.DONOR_SMTP_PASS, from: env.DONOR_SMTP_FROM,
      } : undefined,
    },
    recurring: {
      checkoutEnabled: env.PAYMENT_RECURRING_CHECKOUT_ENABLED,
      dispatchEnabled: env.PAYMENT_RECURRING_DISPATCH_ENABLED,
      termsVersion: null, termsUrl: null, cancellationUrl: null,
      cardLabel: env.PAYMENT_RECURRING_CARD_LABEL ?? null,
      cardMethodCode: env.PAYMENT_RECURRING_CARD_METHOD_CODE ?? null,
      approvalReference: env.PAYMENT_RECURRING_APPROVAL_REFERENCE ?? null,
      maxKopecks: null,
    },
    isProduction,
    deployStage: env.DEPLOY_STAGE,
    http: {
      // Порт хостинга приоритетнее: Vercel и PaaS назначают его сами.
      port: env.PORT ?? env.API_PORT,
      corsOrigins: parseOrigins(env.CORS_ORIGINS),
      trustedProxyCidrs: proxyCidrs ?? [],
    },
    database: {
      url: env.DATABASE_URL,
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS,
      limit: env.THROTTLE_LIMIT,
    },
    publicUrls: {
      apiUrl,
      siteUrl,
    },
    payment: buildPaymentConfig(env),
    admin: {
      // Вне production переменной может не быть — и это не повод пропускать
      // запросы: пустой токен гард трактует как «закрыто наглухо».
      apiToken: env.ADMIN_API_TOKEN ?? '',
    },
    adminAuth: {
      jwtSecret: env.ADMIN_JWT_SECRET ?? ephemeralJwtSecret(),
      cookieSecure: env.ADMIN_COOKIE_SECURE ?? isProduction,
    },
    media: buildMediaConfig(env, apiUrl),
    revalidation: {
      secret: env.REVALIDATE_SECRET,
      url: trimTrailingSlash(env.WEB_REVALIDATE_URL ?? `${siteUrl}${REVALIDATE_PATH}`),
    },
    metrika: {
      offlineEnabled: env.YM_OFFLINE_ENABLED,
      counterId: env.YM_COUNTER_ID,
      oauthToken: env.YM_OAUTH_TOKEN,
      offlineGoal: env.YM_OFFLINE_GOAL,
      intervalMs: env.YM_OFFLINE_INTERVAL_MINUTES * MINUTE_MS,
    },
  };
}
