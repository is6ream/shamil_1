"use client";

import { useEffect, useState } from "react";

/**
 * Видна ли сейчас секция страницы по её id. Для плавающих элементов —
 * нижней плашки телефона и баннера cookie: они прячутся, пока на экране
 * форма доната, чтобы не загораживать её поля.
 */
export function useSectionVisible(sectionId: string, threshold = 0.05): boolean {
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
      { threshold },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
    };
  }, [sectionId, threshold]);

  return isVisible;
}
