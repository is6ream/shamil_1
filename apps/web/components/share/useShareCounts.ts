"use client";

import { useCallback, useState } from "react";

/**
 * Счётчики репостов.
 *
 * Эндпоинта под них нет и не просим: серверный счётчик репостов — это
 * отдельная ручка, которую тут же начнут накручивать, а ценность у неё
 * только психологическая. В MVP счётчик живёт в localStorage браузера
 * и показывает вклад самого человека.
 *
 * TODO(api): если заказчик захочет общие цифры, понадобится
 * `POST /share-events` c троттлингом по IP — тогда этот хук меняет
 * источник данных, а разметка остаётся.
 */
const STORAGE_KEY = "shamil:share-counts";

type Counts = Readonly<Record<string, number>>;

function read(): Counts {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    // Приватный режим и заблокированное хранилище — не повод ломать блок.
    return {};
  }
}

export function useShareCounts(): {
  counts: Counts;
  register: (target: string) => void;
} {
  const [counts, setCounts] = useState<Counts>({});

  const register = useCallback((target: string) => {
    const next = { ...read() };

    next[target] = (next[target] ?? 0) + 1;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ничего страшного: счётчик — украшение, репост уже произошёл.
    }

    setCounts(next);
  }, []);

  return { counts, register };
}
