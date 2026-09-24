/** Точка входа оплаты. Ссылку подписываем локально, HTTP-вызова здесь нет. */
export const ROBOKASSA_PAYMENT_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';

/** Префикс контроллера колбэков. */
export const PAYMENTS_ROUTE_PREFIX = 'payments';

/**
 * Маршрут колбэка внутри контроллера. Полный адрес, который заказчик вбивает
 * в кабинете Robokassa как Result URL, собирается из `PUBLIC_API_URL`,
 * префикса `/api` и этих двух сегментов — см. `buildResultUrl`.
 */
export const ROBOKASSA_RESULT_ROUTE = 'robokassa/result';

/**
 * Пользовательский параметр с публичным id заказа (uuid доната).
 *
 * На Success URL Robokassa возвращает донатера с `InvId`, а страница «спасибо»
 * опрашивает статус по uuid — номер счёта наружу не выдаём, его легко перебрать.
 * `Shp_`-параметры Robokassa возвращает и в Result URL, и на Success/Fail URL,
 * поэтому uuid едет через провайдера туда и обратно. Параметр входит в подпись
 * ссылки и колбэка — подменить его по дороге нельзя.
 *
 * Имя дублируется во фронтенде (`apps/web/lib/routes.ts`).
 */
export const ROBOKASSA_ORDER_SHP_PARAM = 'Shp_order_id';

/** Язык интерфейса на стороне провайдера. */
export const ROBOKASSA_CULTURE = 'ru';

/** `donation.method` — VarChar(32); длиннее обрежется уже в БД. */
export const MAX_METHOD_LENGTH = 32;

/** `Description` у Robokassa — до 100 символов. */
export const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Адрес, который заказчик вбивает в кабинете Robokassa как Result URL.
 * Собирается в одном месте: расхождение между тем, что настроено в кабинете,
 * и тем, что слушает приложение, выглядит как «платежи не подтверждаются»,
 * и ищется долго.
 */
export function buildResultUrl(publicApiUrl: string, globalPrefix: string): string {
  return `${publicApiUrl}/${globalPrefix}/${PAYMENTS_ROUTE_PREFIX}/${ROBOKASSA_RESULT_ROUTE}`;
}
