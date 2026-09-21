/** Префикс всех HTTP-маршрутов бэкенда: `/api/...`. */
export const API_GLOBAL_PREFIX = 'api';

/** Порт бэкенда по умолчанию — 3000 занят фронтендом Next.js. */
export const DEFAULT_API_PORT = 3001;

/** Окно rate limiting по умолчанию, мс. */
export const DEFAULT_THROTTLE_TTL_MS = 60_000;

/** Запросов на IP за окно по умолчанию. */
export const DEFAULT_THROTTLE_LIMIT = 60;

/**
 * Минимальный донат — 100 ₽ в копейках.
 * Суммы по всему проекту хранятся и считаются только в копейках, целым числом:
 * float на деньгах даёт расхождение в сумме сбора (CONTEXT.md §7).
 */
export const MIN_DONATION_KOPECKS = 10_000;

/** Сколько копеек в рубле — чтобы не писать 100 в формулах пересчёта. */
export const KOPECKS_IN_RUBLE = 100;

/**
 * Потолок одного онлайн-доната — 10 000 000 ₽ в копейках.
 *
 * Верхняя граница нужна не против щедрости, а против опечатки и подбора:
 * поле суммы публичное, и заказ на абсурдную сумму — это либо лишний ноль,
 * либо попытка что-то сломать на стороне провайдера. Жертвователь такого
 * порядка в любом случае переводит по реквизитам, а не картой.
 */
export const MAX_DONATION_KOPECKS = 1_000_000_000;

/**
 * Откуда взялся регион доната. `admin` сюда не входит намеренно:
 * его ставит только админский эндпоинт, из публичной формы он недопустим.
 */
export const PUBLIC_REGION_SOURCES = ['link', 'form'] as const;

export type PublicRegionSource = (typeof PUBLIC_REGION_SOURCES)[number];

/** Публичная форма доната: окно и лимит троттлинга, строже глобального. */
export const DONATION_THROTTLE_TTL_MS = 60_000;
export const DONATION_THROTTLE_LIMIT = 10;

/**
 * Верхняя граница номера счёта: Robokassa принимает InvId только как int4.
 * Дублируется в миграции `…_donation_invoice_no` (MAXVALUE последовательности);
 * здесь — чтобы провайдер мог проверить значение до похода к провайдеру.
 */
export const MAX_INVOICE_NO = 2_147_483_647;

/** Код провайдера ручного перевода по реквизитам — постоянный путь, не заглушка. */
export const MANUAL_PROVIDER_CODE = 'manual';

/** Код агрегатора РФ: СБП, SberPay, T-Pay и карты одним мерчант-аккаунтом. */
export const ROBOKASSA_PROVIDER_CODE = 'robokassa';

/**
 * TODO(фискализация): значения ниже — словарь 54-ФЗ, который Robokassa требует
 * в объекте Receipt. Заказчик ещё не подтвердил, подключены ли Робочеки и на
 * какой системе налогообложения работает организация-получатель
 * (открытый вопрос из docs/payments-setup.md, шаг 5). Пока фискализация
 * выключена (`PAYMENT_RECEIPT_ENABLED=false`), Receipt не идёт ни в ссылку,
 * ни в строку подписи — и эти значения не используются.
 * Это единственное место, где словарь объявлен: уточнение правит его здесь.
 */
export const TAXATION_SYSTEMS = [
  'osn',
  'usn_income',
  'usn_income_outcome',
  'esn',
  'patent',
] as const;

export type TaxationSystem = (typeof TAXATION_SYSTEMS)[number];

/** Ставки НДС в чеке. У НКО на пожертвовании обычно `none`. */
export const VAT_RATES = ['none', 'vat0', 'vat10', 'vat110', 'vat20', 'vat120'] as const;

export type VatRate = (typeof VAT_RATES)[number];
