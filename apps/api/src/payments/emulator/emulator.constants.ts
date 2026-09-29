/**
 * Локальный эмулятор страницы оплаты Robokassa.
 *
 * Зачем он: мерчант не зарегистрирован, а тестовый режим Robokassa требует
 * зарегистрированный магазин и публичный Result URL. Эмулятор проходит через
 * настоящий `RobokassaProvider`: подпись ссылки паролем #1, подписанный
 * колбэк паролем #2 по HTTP на наш Result URL, возврат на Success URL.
 * Переход на настоящую Robokassa — только правка `.env`.
 */

/** Префикс маршрутов эмулятора: `/api/dev/robokassa/…`. */
export const EMULATOR_ROUTE_PREFIX = 'dev/robokassa';
export const EMULATOR_CHECKOUT_ROUTE = 'checkout';
export const EMULATOR_PAY_ROUTE = 'pay';

/**
 * Сценарии страницы оплаты. Каждый проверяет одну гарантию из CLAUDE.md:
 * поллинг «спасибо» 3 с × 10, «мы ещё проверяем» после окна поллинга,
 * идемпотентность колбэка, расхождение суммы, 401 на битую подпись, отказ.
 */
export const EMULATOR_SCENARIOS = [
  'pay',
  'pay_delay_10',
  'pay_delay_45',
  'pay_twice',
  'pay_underpaid',
  'bad_signature',
  'refuse',
] as const;

export type EmulatorScenario = (typeof EMULATOR_SCENARIOS)[number];

/** Колбэк через 10 с — внутри окна поллинга «спасибо» (30 с). */
export const SHORT_CALLBACK_DELAY_MS = 10_000;

/** Колбэк через 45 с — после окна поллинга: экран «мы ещё проверяем». */
export const LONG_CALLBACK_DELAY_MS = 45_000;

/** «Оплатить на 1 ₽ меньше» — ветка расхождения суммы. */
export const UNDERPAY_KOPECKS = 100n;

/**
 * Способы оплаты на странице эмулятора и значение `IncCurrLabel` в колбэке.
 *
 * TODO(словарь способов): настоящие значения `IncCurrLabel` у Robokassa
 * документацией не зафиксированы — тот же TODO стоит в `robokassa.provider.ts`.
 * Здесь выбраны такие, что после приведения к нижнему регистру совпадают
 * с кодами ленты (`sbp`, `card`, `sberpay`, `tpay`); это заглушка эмулятора,
 * а не знание о Robokassa. Сверить по первому колбэку тестового режима.
 */
export const EMULATOR_METHODS = {
  sbp: { label: 'СБП', incCurrLabel: 'SBP' },
  card: { label: 'Карта', incCurrLabel: 'Card' },
  sberpay: { label: 'SberPay', incCurrLabel: 'SberPay' },
  tpay: { label: 'T-Pay', incCurrLabel: 'TPay' },
} as const;

export type EmulatorMethod = keyof typeof EMULATOR_METHODS;

export const DEFAULT_EMULATOR_METHOD: EmulatorMethod = 'sbp';

/** Фейковая почта плательщика: проверяет, что она не оседает в `payment_event.payload`. */
export const EMULATOR_PAYER_EMAIL = 'payer@emulator.invalid';

/** Сколько живёт ссылка сценария. Дольше незачем: страницу открывают и сразу жмут. */
export const SCENARIO_LINK_TTL_MS = 30 * 60 * 1000;

/**
 * Параметры, которые шлёт `RobokassaProvider`. Эмулятор строг, как Robokassa:
 * неизвестный параметр — ошибка, а не молчаливое «проглотим».
 * `Shp_*` проверяются отдельно, по префиксу.
 */
export const CHECKOUT_KNOWN_PARAMS: ReadonlySet<string> = new Set([
  'MerchantLogin',
  'OutSum',
  'InvId',
  'Description',
  'SignatureValue',
  'IsTest',
  'Culture',
  'Encoding',
  'Receipt',
]);
