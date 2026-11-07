/**
 * Правила офлайн-конверсий Яндекс Метрики. Источники — официальная документация:
 * - https://yandex.ru/dev/metrika/ru/management/offline-conv — формат CSV;
 * - https://yandex.ru/dev/metrika/ru/management/conversion — окно 21 день;
 * - https://yandex.ru/dev/metrika/ru/management/openapi/offline_conversions/upload_1 — метод загрузки.
 */

/** Цель по умолчанию. В Метрике — тип «JavaScript-событие», условие «совпадает». */
export const YM_DEFAULT_OFFLINE_GOAL = 'donation_paid';

/** Идентификатор цели: латиница, цифры, `_` и `-`. Он же уходит в CSV без экранирования. */
export const YM_GOAL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Короче токен Яндекс OAuth не бывает; защита от переменной, заполненной «для вида». */
export const YM_OAUTH_TOKEN_MIN_LENGTH = 20;

export const YM_OFFLINE_DEFAULT_INTERVAL_MINUTES = 30;
export const YM_OFFLINE_MAX_INTERVAL_MINUTES = 24 * 60;

/** ClientID — `getClientID()` счётчика: только цифры. Зеркало CHECK `donation_ym_client_id_format`. */
export const YM_CLIENT_ID_PATTERN = /^[0-9]{1,32}$/;

/** yclid — номер клика Директа. Зеркало CHECK `donation_yclid_format`. */
export const YCLID_PATTERN = /^[0-9]{1,64}$/;

export const METRIKA_API_BASE_URL = 'https://api-metrika.yandex.net';

/** Валюта ценности цели — ISO 4217. Учёт сбора ведётся в копейках рубля. */
export const CONVERSION_CURRENCY = 'RUB';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Окно сопоставления: Метрика привязывает конверсию к визиту, только если
 * между последним визитом и обработкой файла прошло не больше 21 дня.
 * Время визита нам неизвестно — приближаем временем оплаты (оплата почти
 * всегда в том же визите). Старше — `SKIPPED/expired`, выгружать бессмысленно.
 */
export const CONVERSION_MATCH_WINDOW_MS = 21 * DAY_MS;

/**
 * `DateTime` в файле должен быть в прошлом на момент загрузки, иначе Метрика
 * отклоняет файл. Минута запаса — на расхождение часов с серверами Яндекса.
 */
export const CONVERSION_MIN_AGE_MS = MINUTE_MS;

/**
 * Данные появляются в отчётах до ~3 часов после загрузки. Это нормально:
 * статус `UPLOADED` в это время — ожидание, а не повод выгружать заново.
 */
export const REPORT_DELAY_NOTE = 'Метрика показывает данные в отчётах в течение ~3 часов после загрузки';

/** Строк в одном файле. Лимит Метрики — 1 ГБ; пачка ограничена ради коротких транзакций. */
export const UPLOAD_BATCH_SIZE = 500;

/** Сколько загрузок опрашивать за один проход. */
export const STATUS_POLL_BATCH_SIZE = 20;

/** Попыток выгрузки строки, после которых она — `FAILED`. */
export const MAX_UPLOAD_ATTEMPTS = 5;

/** `UPLOADING` дольше этого — инстанс упал посреди выгрузки, строку возвращаем в очередь. */
export const STALE_LOCK_MS = 15 * MINUTE_MS;

/** HTTP: таймаут запроса и повторы для 429/5xx/сетевых ошибок. */
export const HTTP_TIMEOUT_MS = 30_000;
export const HTTP_MAX_RETRIES = 3;
export const HTTP_RETRY_BASE_DELAY_MS = 1_000;

/** `comment` загрузки — до 255 символов по спецификации метода. */
export const UPLOAD_COMMENT_MAX_LENGTH = 255;

/** `last_error` — `VarChar(500)`. */
export const LAST_ERROR_MAX_LENGTH = 500;

/** Почему строка не выгружается. */
export const SKIP_REASONS = {
  /** Ни ClientID, ни yclid: человек без согласия на cookie или с блокировщиком. */
  noIdentifier: 'no_identifier',
  /** Оплата старше окна сопоставления. */
  expired: 'expired',
} as const;

/**
 * Статусы загрузки в Метрике (`uploading.status`). Конечные для нас —
 * `PROCESSED` и `LINKAGE_FAILURE`; остальные (`PREPARED`, `UPLOADED`,
 * `EXPORTED`, `MATCHED`) — обработка ещё идёт.
 */
export const UPLOADING_DONE_STATUS = 'PROCESSED';
export const UPLOADING_LINKAGE_FAILURE_STATUS = 'LINKAGE_FAILURE';
