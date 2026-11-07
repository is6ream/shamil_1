"use client";

import { useEffect, useState } from "react";

/** Доля секции на экране, с которой она считается видимой. */
const VISIBLE_THRESHOLD = 0.05;

/**
 * Видна ли сейчас секция страницы по её id. Для плавающих элементов —
 * нижней плашки телефона и баннера cookie: они прячутся, пока на экране
 * форма доната, чтобы не загораживать её поля.
 */
export function useSectionVisible(sectionId: string): boolean {
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    const section = document.getElementById(sectionId);

    if (section === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting));
      },
      { threshold: VISIBLE_THRESHOLD },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
    };
  }, [sectionId]);

  return isVisible;
}
