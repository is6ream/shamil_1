/**
 * Пути, о которых бэкенд знает заранее.
 *
 * Зеркало `apps/api/src/payments/payments.constants.ts`. Расхождение здесь
 * ломает возврат с оплаты: провайдер уводит человека на адрес, который
 * ему выдал бэкенд, и если такого маршрута в Next.js нет, донатер после
 * списания денег видит 404.
 */

/** Реквизиты и QR СБП. Сюда бэкенд редиректит при ручном переводе. */
export const MANUAL_TRANSFER_PATH = "/donate/transfer";

/** «Спасибо»: опрашивает статус заказа 3 с × 10. */
export const THANKS_PATH = "/spasibo";

/** Имя query-параметра с публичным id заказа. */
export const ORDER_QUERY_PARAM = "order_id";

/**
 * Тот же id заказа, но в имени, под которым его возвращает Robokassa
 * на Success URL. Зеркало `ROBOKASSA_ORDER_SHP_PARAM`
 * в apps/api/src/payments/robokassa/robokassa.constants.ts.
 */
export const PROVIDER_ORDER_QUERY_PARAM = "Shp_order_id";

/** Параметр региональной ссылки: `?region=bashkortostan`. */
export const REGION_QUERY_PARAM = "region";

export function buildOrderUrl(path: string, orderId: string): string {
  return `${path}?${ORDER_QUERY_PARAM}=${encodeURIComponent(orderId)}`;
}
