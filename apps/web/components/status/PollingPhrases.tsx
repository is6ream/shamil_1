"use client";

import { useEffect, useState } from "react";

import styles from "./PollingPhrases.module.css";

/**
 * Фразы лоадера. Тридцать секунд молчания читаются как зависание, а
 * прокрутка фраз показывает, что процесс идёт. Последняя остаётся висеть.
 *
 * Индикатора прогресса здесь нет сознательно: шкала, добежавшая до 100%
 * без ответа, читается как отказ — а отказа нет, вебхук приходит и позже.
 */
const PHRASES = [
  "Проверяем ваш платёж…",
  "Убеждаемся, что ваш взнос дошёл…",
  "Ждём подтверждение от банка…",
  "Платёжная система отвечает не сразу — это нормально…",
] as const;

/** Пауза между фразами, мс. */
const PHRASE_INTERVAL_MS = 4000;

export function PollingPhrases() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= PHRASES.length - 1) {
      return;
    }

    const timer = setTimeout(() => {
      setIndex((current) => current + 1);
    }, PHRASE_INTERVAL_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [index]);

  return (
    // Высота фиксирована: разная длина фраз иначе дёргала бы страницу.
    // `aria-live` проговаривает смену статуса вслух.
    <p className={styles.phrases} role="status" aria-live="polite">
      {PHRASES[index]}
    </p>
  );
}
