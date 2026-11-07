"use client";

import { useSyncExternalStore } from "react";

import { createConsentStore } from "@/lib/analytics/consent";
import type { ConsentDecision, ConsentState, CookieJar } from "@/lib/analytics/consent";
import { readCookie } from "@/lib/attribution";

const documentJar: CookieJar = {
  read: (name) => readCookie(document.cookie, name),
  write: (cookie) => {
    document.cookie = cookie;
  },
  get isSecure() {
    return window.location.protocol === "https:";
  },
};

/** Одно хранилище на вкладку: баннер и счётчик видят одно и то же решение. */
const consentStore = createConsentStore(documentJar);

/** На сервере и до гидратации решения нет — ни баннера, ни счётчика. */
const getServerSnapshot = (): null => null;

/** Решение о cookie Метрики. `null` — сервер/гидратация, ещё рано что-то показывать. */
export function useConsent(): ConsentState | null {
  return useSyncExternalStore(consentStore.subscribe, consentStore.getSnapshot, getServerSnapshot);
}

export function decideConsent(decision: ConsentDecision): void {
  consentStore.decide(decision);
}
