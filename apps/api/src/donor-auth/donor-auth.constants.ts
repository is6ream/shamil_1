/**
 * Параметры входа в кабинет жертвователя. Отдельно от `auth.constants.ts`
 * админки: у кабинета нет паролей и ролей, и его настройки не должны
 * случайно поменяться вместе с админскими.
 */

/** Цифр в коде входа. */
export const LOGIN_CODE_LENGTH = 6;

/** Сколько живёт код. Совпадает с текстом письма. */
export const LOGIN_CODE_TTL_MINUTES = 10;
export const LOGIN_CODE_TTL_MS = LOGIN_CODE_TTL_MINUTES * 60_000;

/** Неверных вводов одного кода, после которых он недействителен. */
export const MAX_CODE_ATTEMPTS = 5;

/**
 * Лимит кодов на один e-mail: не чаще раза в минуту и не больше пяти за час.
 * Сверх лимита ответ тот же, письмо просто не уходит — иначе по разнице
 * ответов можно было бы узнать, что адрес уже кто-то вводил.
 */
export const CODE_RESEND_INTERVAL_MS = 60_000;
export const CODE_HOURLY_LIMIT = 5;
export const CODE_WINDOW_MS = 60 * 60_000;

/** Срок жизни access-JWT жертвователя. Держится только в памяти вкладки. */
export const DONOR_ACCESS_TTL_SECONDS = 15 * 60;

/** Срок жизни refresh-JWT в cookie: жертвователь заходит редко, раз в месяц. */
export const DONOR_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export const DONOR_REFRESH_COOKIE_NAME = 'shamil_donor_rt';

/** Cookie уходит только на маршруты сессии кабинета. */
export const DONOR_REFRESH_COOKIE_PATH = '/api/donor/auth';

/**
 * Издатель общий, аудитории — свои. Админский `aud` — `shamil-admin`
 * (auth.constants.ts), и токен одного кабинета не проходит проверку другого
 * даже при совпавших ключах.
 */
export const DONOR_JWT_ISSUER = 'shamil-api';
export const DONOR_ACCESS_AUDIENCE = 'shamil-donor';
export const DONOR_REFRESH_AUDIENCE = 'shamil-donor-refresh';

/** Лимиты на IP: запрос кода, ввод кода, обновление сессии. */
export const REQUEST_CODE_THROTTLE = { limit: 5, ttl: 60_000 } as const;
export const VERIFY_CODE_THROTTLE = { limit: 10, ttl: 60_000 } as const;
export const DONOR_REFRESH_THROTTLE = { limit: 20, ttl: 60_000 } as const;

/** Обычные маршруты кабинета: страница — несколько запросов. */
export const DONOR_THROTTLE = { limit: 120, ttl: 60_000 } as const;

/** Домен HMAC кода входа: тот же ключ подписывает ссылки отмены, и строки не должны пересекаться. */
export const LOGIN_CODE_HMAC_DOMAIN = 'donor-login-code';
