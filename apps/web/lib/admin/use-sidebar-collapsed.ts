"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Свёрнутый сайдбар — удобство одного человека на одном устройстве,
 * поэтому `localStorage`, а не сервер. Хранилище может быть недоступно
 * (приватный режим, запрет сайтовых данных): тогда меню просто развёрнуто.
 */
const STORAGE_KEY = "admin:sidebar-collapsed";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch (storageError: unknown) {
    // Хранилище закрыто — не беда, меню остаётся развёрнутым.
    void storageError;
    return false;
  }
}

function write(isCollapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, isCollapsed ? "1" : "0");
  } catch (storageError: unknown) {
    // Не запомнится до перезагрузки, но в этой вкладке переключение сработает.
    void storageError;
  }

  memory = isCollapsed;
  listeners.forEach((listener) => listener());
}

/** Значение на случай закрытого хранилища: переключатель работает хотя бы в памяти. */
let memory: boolean | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  if (memory === null) {
    memory = read();
  }

  return memory;
}

/** На сервере сайдбар всегда развёрнут: состояние известно только браузеру. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): readonly [boolean, () => void] {
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => write(!getSnapshot()), []);

  return [isCollapsed, toggle] as const;
}
