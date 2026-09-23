"use client";

import { useEffect, useState } from "react";

import { getDonationStatus } from "@/lib/api/client";
import type { DonationStatusResponse } from "@/lib/api/types";

/** Пауза между опросами, мс. */
export const POLL_INTERVAL_MS = 3000;

/** Сколько раз спрашиваем. 3 с × 10 = 30 секунд, как у референса. */
export const POLL_MAX_ATTEMPTS = 10;

/**
 * Что показывать на экране.
 *
 * `timeout` — это НЕ провал. Вебхук провайдера регулярно приходит позже
 * пользовательского редиректа: это два независимых канала, и редирект
 * почти всегда быстрее. Донат может подтвердиться и через минуту.
 */
export type PollingPhase = "checking" | "paid" | "failed" | "timeout" | "error";

interface PollingResult {
  readonly phase: PollingPhase;
  readonly status: DonationStatusResponse | null;
  /** Сообщение, если статус не удалось получить вовсе. */
  readonly error: string | null;
  /** Кнопка «Проверить ещё раз» после истечения окна. */
  readonly retry: () => void;
}

/**
 * Опрос статуса заказа для страницы «спасибо».
 *
 * Опрашиваем именно потому, что донат подтверждает вебхук, а не редирект
 * с клиента. Окно 30 секунд выбрано не на глаз: столько ждёт референс,
 * обкатавший схему на 23 878 платежах.
 *
 * Счётчик попыток живёт внутри эффекта, а не в состоянии: эффект владеет
 * всей цепочкой таймеров целиком, и выносить счётчик наружу означало бы
 * перезапускать его на каждой попытке — то есть плодить параллельные
 * опросы.
 */
export function useDonationStatus(orderId: string | null): PollingResult {
  const [phase, setPhase] = useState<PollingPhase>(orderId === null ? "error" : "checking");
  const [status, setStatus] = useState<DonationStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (orderId === null) {
      return;
    }

    let isActive = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = async () => {
      try {
        const next = await getDonationStatus(orderId);

        if (!isActive) {
          return;
        }

        setStatus(next);

        if (next.status === "paid") {
          setPhase("paid");
          return;
        }

        if (next.status === "failed") {
          setPhase("failed");
          return;
        }

        attempt += 1;

        if (attempt >= POLL_MAX_ATTEMPTS) {
          setPhase("timeout");
          return;
        }

        timer = setTimeout(() => {
          void ask();
        }, POLL_INTERVAL_MS);
      } catch {
        if (!isActive) {
          return;
        }

        // Сетевой сбой или неизвестный заказ. Деньги при этом могли уйти,
        // поэтому текст на экране всё равно не про неудачу платежа.
        setError("Не удалось проверить платёж прямо сейчас");
        setPhase("timeout");
      }
    };

    void ask();

    return () => {
      isActive = false;

      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
    // `round` перезапускает опрос по кнопке «Проверить ещё раз».
  }, [orderId, round]);

  return {
    phase,
    status,
    error,
    retry: () => {
      setError(null);
      setPhase("checking");
      setRound((current) => current + 1);
    },
  };
}
