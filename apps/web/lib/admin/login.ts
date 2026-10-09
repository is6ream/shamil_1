/**
 * Запрос входа в админку — без React и без сессии.
 *
 * Им пользуются и `AdminSessionProvider` (страница `/admin/login`), и модалка
 * входа в шапке сайта (D-F11). Модалка живёт на публичных страницах, где
 * провайдера сессии нет: она только получает refresh-cookie и уводит в `/admin`.
 */

import type { AdminClient } from "./api-client";
import { AUTH_PATHS } from "./endpoints";
import type { LoginBody } from "./endpoints";
import { AdminApiError } from "./errors";

/**
 * Одна формулировка на «нет такой почты» и «не тот пароль»: по тексту
 * нельзя понять, существует ли e-mail.
 */
export const WRONG_CREDENTIALS = "Неверная почта или пароль.";

/** Почта в базе хранится в нижнем регистре; пароль не трогаем. */
export function normalizeLoginBody(body: LoginBody): LoginBody {
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

/**
 * `POST /admin/auth/login`. Успех — сырой ответ (`{ accessToken, user, … }`,
 * разбирает вызывающий), refresh-cookie API ставит сам. 401 здесь значит
 * «неверные данные», а не «истёк токен», поэтому refresh не пробуем.
 */
export async function loginRequest(client: AdminClient, body: LoginBody): Promise<unknown> {
  try {
    return await client.request<unknown>(AUTH_PATHS.login, {
      body: normalizeLoginBody(body),
      skipAuthRetry: true,
    });
  } catch (error: unknown) {
    if (error instanceof AdminApiError && error.status === 401) {
      throw new AdminApiError(401, [WRONG_CREDENTIALS]);
    }

    throw error;
  }
}
