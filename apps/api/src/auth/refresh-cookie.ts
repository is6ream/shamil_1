import type { CookieOptions, Response } from 'express';

import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import type { AuthRequest } from './auth.types';

/**
 * Cookie refresh-токена (D-05): `httpOnly` — скрипт страницы её не прочитает,
 * `SameSite=Strict` и узкий `Path` — она не уходит ни на чужие сайты, ни на
 * остальные маршруты API, `Secure` — только по HTTPS в production.
 *
 * Разбор заголовка `Cookie` — свой, в десять строк: ради одной cookie
 * тянуть `cookie-parser` незачем.
 */
export function refreshCookieOptions(secure: boolean, expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(expiresAt === undefined ? {} : { expires: expiresAt }),
  };
}

export function setRefreshCookie(response: Response, token: string, expiresAt: Date, secure: boolean): void {
  response.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(secure, expiresAt));
}

export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(secure));
}

/** Значение refresh-cookie из заголовка или `null`. */
export function readRefreshCookie(request: AuthRequest): string | null {
  const header = request.headers.cookie;

  if (typeof header !== 'string') {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();

      return value.length > 0 ? safeDecode(value) : null;
    }
  }

  return null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    // Битое percent-кодирование — это не наш токен; дальше он просто не найдётся.
    return null;
  }
}
