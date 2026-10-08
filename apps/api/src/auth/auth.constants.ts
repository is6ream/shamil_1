/**
 * Параметры сессий админки (DECISIONS.md, D-04 и D-05).
 * Каждое число здесь — компромисс между удобством заказчика и ценой утечки.
 */

/** Стоимость bcrypt: ~250 мс на хеш — терпимо для входа, дорого для перебора. */
export const BCRYPT_COST = 12;

/**
 * bcrypt молча обрезает пароль после 72 байт. Длиннее — значит часть пароля
 * ничего не защищает, и человек об этом не узнает. Поэтому лимит явный.
 */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_MIN_LENGTH = 12;

/** Срок жизни access-JWT. Токен живёт только в памяти вкладки. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Срок жизни refresh-токена в cookie. Каждое обновление выдаёт новый. */
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Случайные байты refresh-токена. В базе — только SHA-256 от них. */
export const REFRESH_TOKEN_BYTES = 32;

/** Неудачных входов подряд до блокировки. */
export const MAX_FAILED_LOGINS = 5;

/** На сколько блокируется вход после `MAX_FAILED_LOGINS` неудач. */
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** Имя cookie refresh-токена. */
export const REFRESH_COOKIE_NAME = 'shamil_admin_rt';

/**
 * Путь cookie: браузер отправляет её только на маршруты сессии,
 * остальные админские запросы её не несут — это и есть защита от CSRF (D-05).
 */
export const REFRESH_COOKIE_PATH = '/api/admin/auth';

/** Издатель и аудитория JWT — токен другого сервиса с тем же ключом не пройдёт. */
export const JWT_ISSUER = 'shamil-api';
export const JWT_AUDIENCE = 'shamil-admin';

/** Строгие лимиты на вход и обновление сессии — против перебора паролей. */
export const LOGIN_THROTTLE = { limit: 5, ttl: 60_000 } as const;
export const REFRESH_THROTTLE = { limit: 20, ttl: 60_000 } as const;

/**
 * Лимит для админских маршрутов. Глобальные 60/мин на IP админке тесны:
 * одна страница дашборда — несколько запросов, а офис заказчика — один IP.
 */
export const ADMIN_THROTTLE = { limit: 300, ttl: 60_000 } as const;

/** Длина user-agent, которая сохраняется вместе с refresh-токеном и в журнале. */
export const USER_AGENT_MAX_LENGTH = 256;
