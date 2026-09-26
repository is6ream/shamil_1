"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Сколько висит подтверждение «Скопировано». */
const CONFIRMATION_MS = 2000;

export interface CopyState {
  /** Ключ последнего успешно скопированного значения, иначе `null`. */
  readonly copiedKey: string | null;
  /** Копирование не удалось (нет Clipboard API, запрет браузера). */
  readonly hasFailed: boolean;
  readonly copy: (key: string, text: string) => Promise<void>;
}

/**
 * Копирование в буфер с подтверждением.
 *
 * `key` отличает, что именно скопировано: в таблице реквизитов семь кнопок,
 * и подтверждение должно появиться у той, которую нажали. Ошибку не
 * глотаем молча — компонент показывает её человеку, чтобы он скопировал
 * значение руками.
 */
export function useCopy(): CopyState {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [hasFailed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = useCallback(async (key: string, text: string) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }

    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopiedKey(key);
    } catch {
      // Clipboard API недоступен (http, старый браузер) или запрещён.
      setCopiedKey(null);
      setFailed(true);
    }

    timer.current = setTimeout(() => {
      setCopiedKey(null);
      setFailed(false);
    }, CONFIRMATION_MS);
  }, []);

  return { copiedKey, hasFailed, copy };
}
