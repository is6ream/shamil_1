"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * Попал ли элемент в зону видимости хотя бы раз.
 *
 * Для анимации заполнения шкал: без JS шкала уже стоит на своём значении,
 * а класс, который вешается по `true`, лишь проигрывает прокрутку от нуля.
 * После первого срабатывания наблюдатель отключается — анимация разовая.
 */
export function useInViewOnce<T extends Element>(
  threshold = 0.3,
): readonly [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [isInView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (node === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  return [ref, isInView] as const;
}
