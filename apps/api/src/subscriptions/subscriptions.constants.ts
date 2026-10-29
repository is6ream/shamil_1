import { MIN_DONATION_KOPECKS } from '../config/constants';

/**
 * Границы суммы ежемесячного пожертвования: от 10 ₽ до 10 000 000 ₽.
 * Нижняя — тот же `MIN_DONATION_KOPECKS`, что у разового доната (минимум
 * снижен до 10 ₽ 27.10.2026), верхняя — `MAX_DONATION_KOPECKS`.
 */
export const SUBSCRIPTION_MIN_KOPECKS = BigInt(MIN_DONATION_KOPECKS);
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
