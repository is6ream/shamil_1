"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminClient } from "./api-client";
import { AdminApiError, errorMessage } from "./errors";
import { useAdminSession } from "./session";

/**
 * Свои хуки данных вместо react-query: экранов немного, кеш между ними
 * не нужен, а зависимость ради двух хуков — лишняя (промпт, §3).
 */

interface QueryResult<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: string | null;
}

export interface AdminQuery<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  reload(): void;
}

/**
 * GET по пути API. `null` — запрос пока не нужен.
 *
 * «Загружается» выводится из того, что последний ответ получен для другого
 * ключа: так не нужен синхронный setState в эффекте, а старые данные
 * не мелькают под новым фильтром.
 */
export function useAdminQuery<T>(path: string | null): AdminQuery<T> {
  const { client } = useAdminSession();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  const key = path === null ? null : `${attempt}:${path}`;

  useEffect(() => {
    if (path === null || key === null) {
      return;
    }

    const controller = new AbortController();

    client
      .request<T>(path, { signal: controller.signal })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key, data: null, error: errorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [client, path, key]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const isCurrent = result !== null && result.key === key;

  return {
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
    isLoading: key !== null && !isCurrent,
    reload,
  };
}

export interface AdminMutation<A, R> {
  /** `undefined` — запрос не ушёл (уже идёт) или упал; ошибка в `error`. */
  run(args: A): Promise<R | undefined>;
  readonly isPending: boolean;
  readonly error: string | null;
  /** Сообщения валидации сервера целиком — для списка под формой. */
  readonly errors: readonly string[];
}

/** Изменение данных с защитой от двойной отправки. */
export function useAdminMutation<A, R>(
  perform: (client: AdminClient, args: A) => Promise<R>,
): AdminMutation<A, R> {
  const { client } = useAdminSession();
  const inFlight = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const run = useCallback(
    async (args: A) => {
      if (inFlight.current) {
        return undefined;
      }

      inFlight.current = true;
      setIsPending(true);
      setErrors([]);

      try {
        return await perform(client, args);
      } catch (error: unknown) {
        setErrors(error instanceof AdminApiError ? error.messages : [errorMessage(error)]);
        return undefined;
      } finally {
        inFlight.current = false;
        setIsPending(false);
      }
    },
    [client, perform],
  );

  return { run, isPending, error: errors[0] ?? null, errors };
}

const UNSAVED_MESSAGE = "Есть несохранённые изменения. Уйти со страницы без сохранения?";

/**
 * Предупреждение при уходе с несохранённой формы: закрытие вкладки
 * (`beforeunload`) и клики по ссылкам. У App Router нет события смены
 * маршрута, поэтому ссылки перехватываются на фазе захвата.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;

      if (target === null || target.getAttribute("target") === "_blank") {
        return;
      }

      if (!window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);
}
