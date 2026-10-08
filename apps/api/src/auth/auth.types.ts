import type { AdminRole } from '../generated/prisma/enums';

/** Кто выполняет запрос админки. Кладётся в запрос гардом после проверки JWT. */
export interface AdminPrincipal {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly displayName: string | null;
}

/** Полезная нагрузка access-JWT. Роль не берётся отсюда — она перечитывается из БД. */
export interface AccessTokenPayload {
  readonly sub: string;
  /** Версия сессий пользователя на момент выдачи (`admin_user.token_version`). */
  readonly ver: number;
}

/**
 * Запрос ровно в том объёме, который нужен слою авторизации. Типы Express
 * сюда не затаскиваем — так же устроен `AdminTokenGuard`.
 */
export interface AuthRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip?: string;
  admin?: AdminPrincipal;
  /** Запрос прошёл по статическому `ADMIN_API_TOKEN` (D-07), а не по сессии. */
  viaApiToken?: boolean;
}

/** Откуда пришёл запрос — для журнала и refresh-токенов. */
export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** Выданная сессия: access-токен уходит в тело, refresh — в cookie. */
export interface IssuedSession {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: AdminPrincipal;
}
