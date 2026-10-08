import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

import {
  ROBOKASSA_PAYMENT_URL,
  ROBOKASSA_PRODUCTION_URL_PREFIX,
} from '../payments/robokassa/robokassa.constants';
import {
  ADMIN_JWT_SECRET_MIN_LENGTH,
  ADMIN_TOKEN_MIN_LENGTH,
  DEFAULT_API_PORT,
  DEFAULT_MAX_UPLOAD_MB,
  MAX_UPLOAD_MB_CEILING,
  REVALIDATE_SECRET_MIN_LENGTH,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
  EMULATOR_LINK_SECRET_MIN_LENGTH,
  TAXATION_SYSTEMS,
  VAT_RATES,
} from './constants';
import type { TaxationSystem, VatRate } from './constants';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Где запущено приложение. `NODE_ENV` отвечает за сборку и поведение библиотек,
 * а стадия — за то, какие платёжные ограничения действуют. Разделены потому,
 * что Vercel всегда отдаёт функции `NODE_ENV=production`, а демо-стенду нужен
 * эмулятор оплаты. Только `demo` снимает запрет эмулятора в production.
 */
export enum DeployStage {
  Local = 'local',
  Demo = 'demo',
  Production = 'production',
}

/** Реализации `PaymentProvider`. Ручной перевод по реквизитам — не заглушка. */
export enum PaymentProviderCode {
  Manual = 'manual',
  Robokassa = 'robokassa',
}

/** Хранилище медиатеки. `local` — каталог на диске хостинга, без внешних сервисов. */
export enum StorageDriver {
  Local = 'local',
  S3 = 's3',
}

/** Алгоритм подписи выбирается в кабинете мерчанта; строка подписи от него не зависит. */
export enum PaymentHashAlgorithm {
  Md5 = 'md5',
  Sha256 = 'sha256',
}

const MIN_PORT = 1;
const MAX_PORT = 65_535;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * Булев флаг из окружения.
 *
 * Значение читается из `obj` — исходного объекта переменных, а не из `value`:
 * при `enableImplicitConversion` class-transformer успевает прогнать строку
 * через `!!value`, и `PAYMENT_IS_TEST=0` превратилось бы в `true`. В платёжном
 * модуле это означает боевой сбор, уходящий в тестовый режим провайдера, —
 * то есть страницу «спасибо» без единого рубля на счету.
 *
 * Непонятное значение не подменяется дефолтом: возвращается `undefined`,
 * и `@IsBoolean` роняет старт с именем переменной.
 */
function envBoolean(fallback?: boolean): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];

    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return fallback;
    }

    const normalized = raw.trim().toLowerCase();

    if (TRUTHY.has(normalized)) {
      return true;
    }

    if (FALSY.has(normalized)) {
      return false;
    }

    return undefined;
  });
}

/** Условие «поле обязательно, потому что подключён агрегатор». */
function whenRobokassa(env: EnvVars): boolean {
  return env.PAYMENT_PROVIDER === PaymentProviderCode.Robokassa;
}

/**
 * Схема переменных окружения. Приложение не поднимется, пока она не сойдётся:
 * лучше упасть на старте, чем принимать платежи с половиной конфига.
 */
export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  /** См. `DeployStage`. По умолчанию — локальный запуск. */
  @IsEnum(DeployStage)
  DEPLOY_STAGE: DeployStage = DeployStage.Local;

  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  API_PORT: number = DEFAULT_API_PORT;

  /**
   * Порт, который назначает хостинг (Vercel, PaaS). Если задан, приоритетнее
   * `API_PORT`; локально его нет, и поведение не меняется.
   */
  @IsOptional()
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  PORT?: number;

  /** Строка подключения к PostgreSQL. Секрет — только через окружение. */
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  /** Разрешённые Origin через запятую: фронтенд ходит с другого порта/домена. */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:3000';

  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS: number = DEFAULT_THROTTLE_TTL_MS;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = DEFAULT_THROTTLE_LIMIT;

  // ─── Публичные адреса ──────────────────────────────────────────────────────

  /**
   * Внешний адрес бэкенда. Из него собирается URL колбэка, который заказчик
   * вбивает в кабинет Robokassa как Result URL, — за NAT и Nginx приложение
   * своего публичного адреса не знает.
   */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  PUBLIC_API_URL: string = `http://localhost:${DEFAULT_API_PORT}`;

  /** Внешний адрес фронтенда: на него провайдер возвращает донатера. */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  PUBLIC_SITE_URL: string = 'http://localhost:3000';

  // ─── Платёжный провайдер ───────────────────────────────────────────────────

  @IsEnum(PaymentProviderCode)
  PAYMENT_PROVIDER: PaymentProviderCode = PaymentProviderCode.Manual;

  /**
   * Режим провайдера. Значения по умолчанию намеренно нет: выбор между боевыми
   * и тестовыми деньгами не должен доставаться молча. При `manual` не проверяется.
   */
  @ValidateIf(whenRobokassa)
  @envBoolean()
  @IsBoolean()
  PAYMENT_IS_TEST?: boolean;

  /** `MerchantLogin` — идентификатор магазина в кабинете Robokassa. */
  @ValidateIf(whenRobokassa)
  @IsString()
  @MinLength(1)
  PAYMENT_MERCHANT_ID?: string;

  /**
   * Пароль #1 — подпись исходящей ссылки на оплату. Обязателен только в боевом
   * режиме: пока мерчант на модерации (недели, docs/payments-setup.md, трек A),
   * интеграция пишется и гоняется на тестовой паре, и требовать боевые пароли
   * заранее значило бы заблокировать разработку организационным процессом.
   */
  @ValidateIf((env: EnvVars) => whenRobokassa(env) && env.PAYMENT_IS_TEST === false)
  @IsString()
  @MinLength(1)
  PAYMENT_SECRET_KEY?: string;

  /** Пароль #2 — проверка подписи колбэка. Без него вебхук нельзя отличить от подделки. */
  @ValidateIf((env: EnvVars) => whenRobokassa(env) && env.PAYMENT_IS_TEST === false)
  @IsString()
  @MinLength(1)
  PAYMENT_WEBHOOK_SECRET?: string;

  /** Тестовый пароль #1 — отдельная пара, кабинет не переиспользует боевую. */
  @ValidateIf((env: EnvVars) => whenRobokassa(env) && env.PAYMENT_IS_TEST === true)
  @IsString()
  @MinLength(1)
  PAYMENT_TEST_SECRET_KEY?: string;

  /** Тестовый пароль #2. */
  @ValidateIf((env: EnvVars) => whenRobokassa(env) && env.PAYMENT_IS_TEST === true)
  @IsString()
  @MinLength(1)
  PAYMENT_TEST_WEBHOOK_SECRET?: string;

  /**
   * Алгоритм подписи. MD5 — значение по умолчанию в кабинете Robokassa;
   * если заказчик переключит на SHA-256, меняется одна эта переменная.
   */
  @IsEnum(PaymentHashAlgorithm)
  PAYMENT_HASH_ALGORITHM: PaymentHashAlgorithm = PaymentHashAlgorithm.Md5;

  /**
   * Адрес страницы оплаты Robokassa. Меняется только ради локального
   * эмулятора (`…/api/dev/robokassa/checkout`); в production обязан быть
   * `https://auth.robokassa.ru/…` — см. `crossFieldErrors`.
   */
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  PAYMENT_ROBOKASSA_URL: string = ROBOKASSA_PAYMENT_URL;

  /**
   * Локальный эмулятор страницы оплаты Robokassa: сквозная оплата без
   * мерчант-аккаунта. Деньги не списываются. В production запрещён.
   */
  @envBoolean(false)
  @IsBoolean()
  PAYMENT_EMULATOR_ENABLED: boolean = false;

  /**
   * HMAC-ключ ссылок сценариев эмулятора. Без него ключ случайный на каждый
   * запуск процесса — локально это нормально, а в serverless разные инстансы
   * и холодный старт превращают ссылку «Оплатить» в «ссылка недействительна».
   */
  @IsOptional()
  @IsString()
  @MinLength(EMULATOR_LINK_SECRET_MIN_LENGTH)
  PAYMENT_EMULATOR_LINK_SECRET?: string;

  // ─── Фискализация (54-ФЗ), см. TODO в constants.ts ─────────────────────────

  /**
   * Включены ли Робочеки. Пока `false`, `Receipt` не уходит ни в ссылку,
   * ни в строку подписи. Переключение меняет подпись — см. RobokassaProvider.
   */
  @envBoolean(false)
  @IsBoolean()
  PAYMENT_RECEIPT_ENABLED: boolean = false;

  @ValidateIf((env: EnvVars) => env.PAYMENT_RECEIPT_ENABLED)
  @IsIn(TAXATION_SYSTEMS)
  PAYMENT_RECEIPT_SNO?: TaxationSystem;

  @ValidateIf((env: EnvVars) => env.PAYMENT_RECEIPT_ENABLED)
  @IsString()
  @MinLength(1)
  PAYMENT_RECEIPT_ITEM_NAME?: string;

  @ValidateIf((env: EnvVars) => env.PAYMENT_RECEIPT_ENABLED)
  @IsIn(VAT_RATES)
  PAYMENT_RECEIPT_VAT?: VatRate;

  // ─── Админские эндпоинты ───────────────────────────────────────────────────

  /**
   * Статический токен админских эндпоинтов. Полноценной аутентификации в MVP
   * нет (CLAUDE.md: админка — это защищённые эндпоинты, не UI), и подтверждение
   * ручного доната закрыто одним общим токеном.
   *
   * Обязателен только в production: локально и в тестах приложение обязано
   * подниматься без него. Открытым эндпоинт при этом не становится — с пустым
   * токеном гард отклоняет вообще все запросы, включая запрос без заголовка.
   */
  @ValidateIf((env: EnvVars) => env.NODE_ENV === NodeEnv.Production)
  @IsString()
  @MinLength(ADMIN_TOKEN_MIN_LENGTH)
  ADMIN_API_TOKEN?: string;

  // ─── Админ-панель: сессии ──────────────────────────────────────────────────

  /**
   * Ключ подписи access-JWT админки. Обязателен в production. Локально может
   * отсутствовать: тогда ключ случайный на запуск процесса, и сессии
   * не переживают перезапуск — для разработки это честнее, чем общий
   * «dev-секрет» в репозитории.
   */
  @ValidateIf((env: EnvVars) => env.NODE_ENV === NodeEnv.Production || env.ADMIN_JWT_SECRET !== undefined)
  @IsString()
  @MinLength(ADMIN_JWT_SECRET_MIN_LENGTH)
  ADMIN_JWT_SECRET?: string;

  /**
   * Флаг `Secure` у cookie refresh-токена. По умолчанию — как `NODE_ENV=production`:
   * локально сайт ходит по http, и Secure-cookie браузер бы не сохранил.
   */
  @IsOptional()
  @envBoolean()
  @IsBoolean()
  ADMIN_COOKIE_SECURE?: boolean;

  // ─── Медиатека ─────────────────────────────────────────────────────────────

  /** Где лежат загруженные файлы: `local` (каталог на диске) или `s3`. */
  @IsEnum(StorageDriver)
  STORAGE_DRIVER: StorageDriver = StorageDriver.Local;

  /** Каталог медиатеки для `local`. Относительный путь — от рабочего каталога процесса. */
  @IsString()
  @MinLength(1)
  MEDIA_LOCAL_DIR: string = 'uploads';

  /**
   * Публичный адрес, по которому отдаются файлы медиатеки. По умолчанию —
   * сам бэкенд: `${PUBLIC_API_URL}/media`. На хостинге каталог лучше отдавать
   * веб-сервером напрямую — тогда здесь его адрес.
   */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  MEDIA_PUBLIC_URL?: string;

  /** Лимит размера загружаемого изображения, МБ. */
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_MB_CEILING)
  MEDIA_MAX_UPLOAD_MB: number = DEFAULT_MAX_UPLOAD_MB;

  @ValidateIf(whenS3)
  @IsString()
  @MinLength(1)
  S3_BUCKET?: string;

  @ValidateIf(whenS3)
  @IsString()
  @MinLength(1)
  S3_REGION?: string;

  /** Эндпоинт S3-совместимого хранилища (Yandex Object Storage, Selectel, MinIO). */
  @ValidateIf(whenS3)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  S3_ENDPOINT?: string;

  @ValidateIf(whenS3)
  @IsString()
  @MinLength(1)
  S3_ACCESS_KEY_ID?: string;

  @ValidateIf(whenS3)
  @IsString()
  @MinLength(1)
  S3_SECRET_ACCESS_KEY?: string;

  /** Публичный адрес бакета, от которого строятся ссылки на файлы. */
  @ValidateIf(whenS3)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  S3_PUBLIC_URL?: string;

  // ─── Ревалидация фронтенда ─────────────────────────────────────────────────

  /**
   * Общий секрет с Next.js (`REVALIDATE_SECRET` во фронтенде). Не задан —
   * ревалидация выключена: правки появятся на сайте по истечении кеша (до часа).
   */
  @IsOptional()
  @IsString()
  @MinLength(REVALIDATE_SECRET_MIN_LENGTH)
  REVALIDATE_SECRET?: string;

  // ─── Telegram-уведомления ──────────────────────────────────────────────────

  /** Токен бота. Не задан — уведомления выключены, приложение работает. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  TELEGRAM_BOT_TOKEN?: string;

  /** Чат или канал для уведомлений. Нужен вместе с токеном. */
  @ValidateIf((env: EnvVars) => env.TELEGRAM_BOT_TOKEN !== undefined)
  @IsString()
  @MinLength(1)
  TELEGRAM_CHAT_ID?: string;
}

/** Условие «поле обязательно, потому что медиатека в S3». */
function whenS3(env: EnvVars): boolean {
  return env.STORAGE_DRIVER === StorageDriver.S3;
}

/**
 * Правила, связывающие несколько переменных. Декораторы class-validator
 * проверяют поле по отдельности, а здесь цена ошибки — эмулятор, принимающий
 * «оплаты» на боевом сайте, или ссылка оплаты, уводящая донатера не туда.
 * Приложение с такой конфигурацией не стартует, а не деградирует молча.
 */
function crossFieldErrors(env: EnvVars): readonly string[] {
  const errors: string[] = [];
  // Демо-стенд — единственное исключение из запретов production: эмулятор
  // там и есть способ оплаты. Любая другая стадия при NODE_ENV=production
  // проверяется ровно как боевой сайт.
  const isProduction = env.NODE_ENV === NodeEnv.Production && env.DEPLOY_STAGE !== DeployStage.Demo;

  if (isProduction && env.PAYMENT_EMULATOR_ENABLED) {
    errors.push('PAYMENT_EMULATOR_ENABLED: эмулятор оплаты в production запрещён');
  }

  if (isProduction && !env.PAYMENT_ROBOKASSA_URL.startsWith(ROBOKASSA_PRODUCTION_URL_PREFIX)) {
    errors.push(
      `PAYMENT_ROBOKASSA_URL: в production допустим только ${ROBOKASSA_PRODUCTION_URL_PREFIX}…`,
    );
  }

  if (env.PAYMENT_EMULATOR_ENABLED && env.PAYMENT_PROVIDER !== PaymentProviderCode.Robokassa) {
    // Эмулятор проверяет подпись паролями Robokassa — без неё проверять нечем.
    errors.push('PAYMENT_EMULATOR_ENABLED: эмулятор работает только с PAYMENT_PROVIDER=robokassa');
  }

  if (env.PAYMENT_EMULATOR_ENABLED && env.PAYMENT_IS_TEST !== true) {
    errors.push('PAYMENT_EMULATOR_ENABLED: эмулятор требует PAYMENT_IS_TEST=true');
  }

  return errors;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const fieldErrors = validateSync(parsed, { skipMissingProperties: false }).map(
    (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );
  // Межполевые правила имеют смысл, только когда сами поля уже разобраны.
  const errors = fieldErrors.length > 0 ? fieldErrors : crossFieldErrors(parsed);

  if (errors.length > 0) {
    throw new Error(`Некорректные переменные окружения:\n  ${errors.join('\n  ')}`);
  }

  return parsed;
}
