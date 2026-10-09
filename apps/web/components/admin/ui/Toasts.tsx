"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import styles from "./Toasts.module.css";

/** Типовой текст после сохранения контента: правка видна на сайте не мгновенно. */
export const SAVED_MESSAGE = "Сохранено. На сайте обновится в течение минуты.";

const TOAST_TTL_MS = 4500;

type ToastKind = "success" | "error";

interface ToastItem {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Тосты админки. Live-регион рендерится всегда: регион, вставленный в DOM
 * вместе с текстом, скринридеры часто пропускают (как в `components/ui/Toast`).
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = timers.current;

    return () => active.forEach(clearTimeout);
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    nextId.current += 1;
    const id = nextId.current;

    setItems((current) => [...current, { id, kind, message }]);

    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((current) => current.filter((item) => item.id !== id));
    }, TOAST_TTL_MS);
    timers.current.add(timer);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((item) => (
          <p key={item.id} className={`${styles.toast} ${item.kind === "error" ? styles.error : ""}`}>
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  if (api === null) {
    throw new Error("useToast вне ToastProvider");
  }

  return api;
}
