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

/** Параметр региональной ссылки: `?region=bashkortostan`. */
export const REGION_QUERY_PARAM = "region";

export function buildOrderUrl(path: string, orderId: string): string {
  return `${path}?${ORDER_QUERY_PARAM}=${encodeURIComponent(orderId)}`;
}
