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
