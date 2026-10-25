/**
 * Границы суммы ежемесячного пожертвования — как в оферте: от 100 ₽
 * до 10 000 000 ₽. Нижняя совпадает со слоганом («дом в раю за 100 ₽»),
 * верхняя — с `MAX_DONATION_KOPECKS` разового доната.
 */
export const SUBSCRIPTION_MIN_KOPECKS = 10_000n;
export const SUBSCRIPTION_MAX_KOPECKS = 1_000_000_000n;

/** Источник отмены — CHECK `subscription_cancel_source_consistency`. */
export const CANCEL_SOURCES = ['donor', 'link', 'admin'] as const;
export type CancelSource = (typeof CANCEL_SOURCES)[number];

/** Страницы кабинета на фронтенде (их ещё нет — REPORT.md, «что нужно фронту»). */
export const CABINET_PATH = '/cabinet';
export const CANCEL_LINK_PATH = '/cabinet/cancel';

/** Домен HMAC ссылки отмены — отдельно от кода входа, ключ у них общий. */
export const CANCEL_LINK_HMAC_DOMAIN = 'donor-cancel-link';

/** Hex-символов подписи в ссылке: 128 бит — подобрать нельзя, ссылка остаётся короткой. */
export const CANCEL_LINK_SIGNATURE_LENGTH = 32;

/** Текст, когда автосписания в этой конфигурации невозможны. */
export const RECURRING_UNAVAILABLE_MESSAGE =
  'Ежемесячные пожертвования сейчас недоступны — можно пожертвовать разово';
