/**
 * Параметры входа в кабинет жертвователя. Отдельно от `auth.constants.ts`
 * админки: у кабинета нет паролей и ролей, и его настройки не должны
 * случайно поменяться вместе с админскими.
 */

/** Цифр в коде из письма. */
export const LOGIN_CODE_LENGTH = 6;

/**
 * Сколько живёт код. 10 минут, а не 5, как у SMS: письмо идёт дольше и
 * иногда сначала попадает в «Промоакции». Совпадает с текстом письма.
 */
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

/** Писем с кодом с одного IP за час: перебор чужих адресов упрётся сюда. */
export const CODE_HOURLY_LIMIT_PER_IP = 20;

/** Назначение кода: входит в HMAC, код одного назначения не годится для другого. */
export type CodePurpose = 'login' | 'change_email' | 'delete_account';

/** Срок жизни access-JWT жертвователя. Держится только в памяти вкладки. */
export const DONOR_ACCESS_TTL_SECONDS = 15 * 60;

/**
 * Сессия живёт 30 дней с последнего обновления: жертвователь заходит
 * раз в месяц, и выкидывать его каждый раз незачем.
 */
export const DONOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Байт случайности в refresh-токене (base64url, 43 символа). */
export const DONOR_REFRESH_TOKEN_BYTES = 32;

/**
 * Свежий вход: удаление аккаунта без e-mail (вошёл через VK) подтверждается
 * не кодом, а тем, что человек только что заново прошёл VK ID.
 */
export const FRESH_SESSION_MS = 10 * 60_000;

export const DONOR_REFRESH_COOKIE_NAME = 'shamil_donor_rt';

/** Cookie уходит только на маршруты сессии кабинета. */
export const DONOR_REFRESH_COOKIE_PATH = '/api/donor/auth';

/**
 * Издатель общий, аудитория своя. Админский `aud` — `shamil-admin`
 * (auth.constants.ts), и токен одного кабинета не проходит проверку другого
 * даже при совпавших ключах.
 */
export const DONOR_JWT_ISSUER = 'shamil-api';
export const DONOR_ACCESS_AUDIENCE = 'shamil-donor';

/** Лимиты на IP: запрос кода, ввод кода, обновление сессии. */
export const REQUEST_CODE_THROTTLE = { limit: 5, ttl: 60_000 } as const;
export const VERIFY_CODE_THROTTLE = { limit: 10, ttl: 60_000 } as const;
export const DONOR_REFRESH_THROTTLE = { limit: 20, ttl: 60_000 } as const;

/** Обычные маршруты кабинета: страница — несколько запросов. */
export const DONOR_THROTTLE = { limit: 120, ttl: 60_000 } as const;

/** Домен HMAC кода входа: тот же ключ подписывает ссылки отмены, и строки не должны пересекаться. */
export const LOGIN_CODE_HMAC_DOMAIN = 'donor-login-code';

/**
 * Версия текста согласия на обработку ПДн, которое человек отмечает при входе.
 * Меняется вместе с текстом галочки или Политики — тогда согласие
 * перезаписывается при следующем входе (152-ФЗ: видно, на что согласились).
 */
export const PD_CONSENT_VERSION = 'privacy-2026-10';
