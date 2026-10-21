/**
 * Правила атрибуции, общие для DTO доната, коротких ссылок и отчёта.
 * Зеркало во фронтенде — `apps/web/lib/attribution.ts`: фронт отбрасывает
 * неподходящее значение сам, чтобы метка не сорвала донат.
 */

/** Длина значения метки — `VarChar(128)` в `donation.utm_*` и `short_link.utm_*`. */
export const UTM_VALUE_MAX_LENGTH = 128;

/** `VarChar(512)` у `referrer` и `landing_page`. */
export const ATTRIBUTION_URL_MAX_LENGTH = 512;

/**
 * Допустимые символы метки: буквы любого алфавита (кампании пишут и по-русски),
 * цифры и то, что встречается в метках рекламных кабинетов. Ни угловых скобок,
 * ни кавычек: значения показываются в админке и уходят в CSV. Без `@`:
 * e-mail в метке — персональные данные, которым в аналитике не место.
 */
export const UTM_VALUE_PATTERN = /^[\p{L}\p{N} _\-.~+%:/|]+$/u;

export const UTM_MESSAGE = 'UTM-метка: до 128 символов — буквы, цифры, пробел и _ - . ~ + % : / |';

/** Путь без домена: `/`, `/02/`, `/?utm_source=vk`. Пробелы и управляющие символы недопустимы. */
export const LANDING_PAGE_PATTERN = /^\/[^\s<>"']*$/;

/**
 * Окно атрибуции — срок жизни cookie first-touch и last-touch во фронтенде.
 * Время первого захода старше окна (плюс сутки на расхождение часов) не пишется.
 */
export const ATTRIBUTION_WINDOW_DAYS = 90;

/** Насколько «будущее» время первого захода терпим: часы телефона спешат. */
export const FIRST_TOUCH_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Ответы на «Откуда вы узнали о сборе?» во вкладке перевода по реквизитам.
 * У перевода нет перехода по ссылке, и cookie с метками часто нет: человек
 * увидел реквизиты в чате и перевёл из приложения банка.
 */
export const HOW_DID_YOU_HEAR = [
  'telegram',
  'whatsapp',
  'instagram',
  'vk',
  'friends',
  'mosque',
  'banner_qr',
  'other',
] as const;

export type HowDidYouHear = (typeof HOW_DID_YOU_HEAR)[number];
