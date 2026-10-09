/**
 * Единственный HTTP-клиент админки.
 *
 * Сессия по D-05: access-токен живёт только в замыкании этого модуля
 * (не в localStorage/sessionStorage/cookie), refresh — httpOnly-cookie,
 * которую ставит и читает только API. Поэтому каждый запрос идёт
 * с `credentials: "include"`, а токен — в `Authorization: Bearer`.
 *
 * На 401 делается ровно один refresh и один повтор. Параллельные запросы,
 * получившие 401 одновременно, ждут одну общую промису refresh: два refresh
 * подряд с одной cookie API расценит как повторное предъявление
 * ротированного токена и отзовёт всё семейство сессий.
 */

import { AUTH_PATHS, parseAccessToken } from "./endpoints";
import { networkError, toAdminApiError } from "./errors";

export interface AdminClientOptions {
  readonly baseUrl: string;
  /** Подменяется в тестах. */
  readonly fetchImpl?: typeof fetch;
  /** Refresh не помог — сессии больше нет. Здесь уводят на `/admin/login`. */
  readonly onSessionExpired?: () => void;
  /** Взаимоисключение refresh между вкладками; по умолчанию Web Locks API. */
  readonly withRefreshLock?: RefreshLock;
  /** Подменяется в тестах загрузки. */
  readonly xhrFactory?: () => XMLHttpRequest;
}

/** Ответ XHR в том виде, в каком его разбирает клиент. */
interface RawResponse {
  readonly status: number;
  readonly body: unknown;
}

export type RefreshLock = <T>(task: () => Promise<T>) => Promise<T>;

const REFRESH_LOCK_NAME = "shamil-admin-refresh";

/**
 * Refresh-cookie одна на все вкладки, а у API нет окна на гонку: две вкладки,
 * предъявившие одну cookie одновременно, — это «повтор», и API отзывает всё
 * семейство сессий. Web Locks выстраивает вкладки в очередь: вторая идёт
 * уже с cookie, которую обновила первая. Без Web Locks (старый браузер) —
 * без блокировки, как раньше.
 */
const webLocksRefresh: RefreshLock = (task) => {
  if (typeof navigator === "undefined" || navigator.locks === undefined) {
    return task();
  }

  return navigator.locks.request(REFRESH_LOCK_NAME, task);
};

export interface RequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Объект уходит JSON, `FormData` — как есть (заголовок ставит браузер). */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /**
   * Не пытаться обновить сессию на 401. Нужно для входа: там 401 значит
   * «неверный пароль», а не «истёк токен».
   */
  readonly skipAuthRetry?: boolean;
}

export interface AdminClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** Файл (CSV): тело ответа как `Blob`. */
  download(path: string, options?: RequestOptions): Promise<Blob>;
  /**
   * Загрузка multipart с прогрессом (`fetch` прогресса отправки не даёт).
   * Тот же Bearer и тот же один refresh на 401, что у `request`.
   */
  upload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T>;
  /** Обновляет access по refresh-cookie; `false` — сессии нет. */
  refresh(): Promise<boolean>;
  setAccessToken(token: string | null): void;
  hasAccessToken(): boolean;
}

const UNAUTHORIZED = 401;
const NO_CONTENT = 204;

async function readJson(response: Response): Promise<unknown> {
  if (response.status === NO_CONTENT) {
    return null;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function buildInit(options: RequestOptions, token: string | null): RequestInit {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body,
    credentials: "include",
    cache: "no-store",
    signal: options.signal,
  };
}

export function createAdminClient({
  baseUrl,
  fetchImpl = (input, init) => fetch(input, init),
  onSessionExpired,
  withRefreshLock = webLocksRefresh,
  xhrFactory = () => new XMLHttpRequest(),
}: AdminClientOptions): AdminClient {
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;

  async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, buildInit(options, token));
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      throw networkError();
    }
  }

  async function doRefresh(): Promise<boolean> {
    try {
      const response = await send(AUTH_PATHS.refresh, { method: "POST" }, null);

      if (!response.ok) {
        accessToken = null;
        return false;
      }

      accessToken = parseAccessToken(await readJson(response));
      return true;
    } catch {
      accessToken = null;
      return false;
    }
  }

  function refresh(): Promise<boolean> {
    refreshing ??= withRefreshLock(doRefresh).finally(() => {
      refreshing = null;
    });

    return refreshing;
  }

  function expire(): void {
    accessToken = null;
    onSessionExpired?.();
  }

  async function authorizedResponse(path: string, options: RequestOptions): Promise<Response> {
    const usedToken = accessToken;
    const response = await send(path, options, usedToken);

    if (response.status !== UNAUTHORIZED || options.skipAuthRetry === true) {
      return response;
    }

    // Пока этот запрос летел, другой мог уже обновить токен — тогда
    // второй refresh не нужен, достаточно повтора со свежим токеном.
    const isRefreshed = accessToken !== null && accessToken !== usedToken ? true : await refresh();

    if (!isRefreshed) {
      expire();
      return response;
    }

    const retried = await send(path, options, accessToken);

    if (retried.status === UNAUTHORIZED) {
      expire();
    }

    return retried;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await authorizedResponse(path, options);
    const body = await readJson(response);

    if (!response.ok) {
      throw toAdminApiError(response.status, body);
    }

    return body as T;
  }

  async function download(path: string, options: RequestOptions = {}): Promise<Blob> {
    const response = await authorizedResponse(path, options);

    if (!response.ok) {
      throw toAdminApiError(response.status, await readJson(response));
    }

    return response.blob();
  }

  function sendXhr(
    path: string,
    form: FormData,
    token: string | null,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const xhr = xhrFactory();

      xhr.open("POST", `${baseUrl}${path}`);
      xhr.withCredentials = true;
      // Content-Type не задаём: boundary multipart браузер ставит сам.
      if (token !== null) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded / event.total);
        }
      };
      xhr.onload = () => {
        let body: unknown = null;

        try {
          body = xhr.responseText === "" ? null : (JSON.parse(xhr.responseText) as unknown);
        } catch {
          body = null;
        }

        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(networkError());
      xhr.onabort = () => reject(new DOMException("Загрузка отменена", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(form);
    });
  }

  async function upload<T>(
    path: string,
    form: FormData,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    const usedToken = accessToken;
    let response = await sendXhr(path, form, usedToken, onProgress, signal);

    if (response.status === UNAUTHORIZED) {
      const isRefreshed = accessToken !== null && accessToken !== usedToken ? true : await refresh();

      if (!isRefreshed) {
        expire();
        throw toAdminApiError(UNAUTHORIZED, response.body);
      }

      response = await sendXhr(path, form, accessToken, onProgress, signal);

      if (response.status === UNAUTHORIZED) {
        expire();
      }
    }

    if (response.status < 200 || response.status >= 300) {
      throw toAdminApiError(response.status, response.body);
    }

    return response.body as T;
  }

  return {
    request,
    download,
    upload,
    refresh,
    setAccessToken(token) {
      accessToken = token;
    },
    hasAccessToken() {
      return accessToken !== null;
    },
  };
}
