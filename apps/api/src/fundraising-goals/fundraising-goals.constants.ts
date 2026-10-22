/**
 * Границы этапа сбора. Те же числа держит CHECK в миграции
 * `20261022120000_fundraising_goals` — сервис отвечает 400 раньше, чем база 500.
 */

/** 1 000 ₽ — меньше этапом не назовёшь. */
export const GOAL_TARGET_MIN_KOPECKS = 100_000n;

/** 100 000 000 ₽ — граница против лишнего нуля. */
export const GOAL_TARGET_MAX_KOPECKS = 10_000_000_000n;

/** Корректировка по модулю — не больше потолка цели. */
export const GOAL_ADJUSTMENT_MAX_ABS_KOPECKS = GOAL_TARGET_MAX_KOPECKS;

export const GOAL_TITLE_MIN_LENGTH = 3;
export const GOAL_TITLE_MAX_LENGTH = 80;
export const GOAL_DESCRIPTION_MAX_LENGTH = 200;

/**
 * Сколько живёт ответ публичного эндпоинта в памяти процесса. Цифры
 * двигаются донатами, и полминуты задержки на главной незаметны,
 * а SUM по донатам на каждый запрос — лишний.
 */
export const ACTIVE_GOAL_CACHE_TTL_MS = 30_000;

/**
 * Лимит публичного эндпоинта на IP. Сайт берёт его через ISR раз в минуту,
 * браузеры сюда не ходят; лимит — от перебора, а не от сайта.
 */
export const PUBLIC_GOAL_THROTTLE = { limit: 120, ttl: 60_000 } as const;

/** Тег кеша сайта, который сбрасывается после правки этапа. */
export const ACTIVE_GOAL_REVALIDATE_TAG = 'active-goal';
