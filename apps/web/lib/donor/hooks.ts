"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/lib/admin/errors";

import { donorClient } from "./session";

interface QueryResult<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: string | null;
}

export interface DonorQuery<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  reload(): void;
}

/**
 * GET кабинета. Тот же приём, что `useAdminQuery`: «загружается» выводится
 * из того, что последний ответ получен для другого ключа. `null` — пока
 * не нужен (например, сессия ещё не восстановлена).
 */
export function useDonorQuery<T>(path: string | null): DonorQuery<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  const key = path === null ? null : `${attempt}:${path}`;

  useEffect(() => {
    if (path === null || key === null) {
      return;
    }

    const controller = new AbortController();

    donorClient()
      .request<T>(path, { signal: controller.signal })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key, data: null, error: errorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const isCurrent = result !== null && result.key === key;

  return {
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
    isLoading: key !== null && !isCurrent,
    reload,
  };
}
