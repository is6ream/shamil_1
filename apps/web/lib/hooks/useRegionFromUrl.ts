"use client";

import { useSyncExternalStore } from "react";

import { REGION_QUERY_PARAM } from "@/lib/routes";

/**
 * Адресная строка за время жизни страницы не меняется: региональная
 * ссылка — это вход на страницу, а не навигация внутри неё. Подписываться
 * не на что, но `useSyncExternalStore` требует функцию подписки.
 */
const subscribeToNothing = () => () => {};

function readRegionFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get(REGION_QUERY_PARAM);
}

/**
 * Слаг региона из `?region=…` — внешнее состояние, поэтому через
 * `useSyncExternalStore`, а не эффектом с `setState`.
 *
 * Серверный снимок `null`: обращение к `searchParams` страницы сделало бы
 * главную динамической, а репост в WhatsApp упирается в скорость ответа.
 */
export function useRegionFromUrl(): string | null {
  return useSyncExternalStore(subscribeToNothing, readRegionFromLocation, () => null);
}
