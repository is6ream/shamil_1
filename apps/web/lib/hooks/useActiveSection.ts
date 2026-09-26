"use client";

import { useEffect, useState } from "react";

/**
 * Какая из секций сейчас под шапкой — для подсветки пункта навигации.
 *
 * Наблюдаем полосу чуть ниже шапки: секция считается активной, когда её
 * верх прошёл под шапку, а низ ещё не ушёл. Секций, которых нет на
 * странице, просто не наблюдаем.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const sectionIds = key.split(",");
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }

        // Если в полосе несколько секций, активна первая по порядку меню.
        setActiveId(sectionIds.find((id) => visible.has(id)) ?? null);
      },
      // Полоса от низа шапки до 40% высоты окна.
      { rootMargin: "-90px 0px -60% 0px" },
    );

    for (const id of sectionIds) {
      const node = document.getElementById(id);

      if (node !== null) {
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [key]);

  return activeId;
}
