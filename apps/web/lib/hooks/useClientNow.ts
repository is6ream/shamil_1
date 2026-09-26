"use client";

import { useSyncExternalStore } from "react";

/**
 * Момент загрузки страницы в браузере. Один на всю страницу и не меняется:
 * `getSnapshot` у `useSyncExternalStore` обязан возвращать стабильное
 * значение, иначе React уйдёт в бесконечный перерендер.
 */
const LOADED_AT = typeof window === "undefined" ? null : Date.now();

const subscribeToNothing = () => () => {};

/**
 * «Сейчас» для относительных дат («Сегодня», «Вчера»).
 *
 * На сервере и при гидратации — `null`: главная статическая, и «сегодня»
 * на момент сборки — не «сегодня» у читателя. Компонент рисует абсолютную
 * дату, а после гидратации React перерисует её относительной — без
 * hydration mismatch.
 */
export function useClientNow(): number | null {
  return useSyncExternalStore(
    subscribeToNothing,
    () => LOADED_AT,
    () => null,
  );
}
