/**
 * Согласие на аналитические cookie (Яндекс Метрика).
 *
 * Решение человека хранится в first-party cookie `shamil_consent` на год:
 * отказ запоминается так же, как согласие, баннер больше не показывается.
 *
 * Наш собственный учёт меток (`shamil_ft` / `shamil_lt` / `shamil_yclid`)
 * от этого согласия не зависит: это строго необходимые cookie для учёта
 * пожертвования, они раскрыты в оферте (п. 7.4) и на странице `/cookie`.
 */

export const CONSENT_COOKIE = "shamil_consent";

export const CONSENT_MAX_AGE_S = 365 * 24 * 60 * 60;

export type ConsentDecision = "granted" | "denied";

/** `unknown` — человек ещё не ответил. На сервере — всегда `unknown`. */
export type ConsentState = ConsentDecision | "unknown";

export function parseConsent(raw: string | undefined): ConsentState {
  return raw === "granted" || raw === "denied" ? raw : "unknown";
}

export function serializeConsentCookie(decision: ConsentDecision, isSecure: boolean): string {
  const attributes = [`${CONSENT_COOKIE}=${decision}`, "Path=/", `Max-Age=${CONSENT_MAX_AGE_S}`, "SameSite=Lax"];

  return (isSecure ? [...attributes, "Secure"] : attributes).join("; ");
}

/** Счётчик можно загрузить: согласие не требуется или получено. */
export function isAnalyticsAllowed(state: ConsentState, requireConsent: boolean): boolean {
  return !requireConsent || state === "granted";
}

/** Доступ к cookie — в браузере `document.cookie`, в тестах — фейк. */
export interface CookieJar {
  read(name: string): string | undefined;
  write(cookie: string): void;
  readonly isSecure: boolean;
}

export interface ConsentStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConsentState;
  decide(decision: ConsentDecision): void;
}

/**
 * Хранилище для `useSyncExternalStore`: баннер и счётчик подписаны на одно
 * состояние, и «Принять» сразу загружает Метрику без перезагрузки страницы.
 * Сбой записи cookie (заблокированы настройками) не ломает страницу:
 * решение действует до конца визита.
 */
export function createConsentStore(jar: CookieJar): ConsentStore {
  const listeners = new Set<() => void>();
  let override: ConsentDecision | null = null;

  const readSafely = (): ConsentState => {
    try {
      return parseConsent(jar.read(CONSENT_COOKIE));
    } catch {
      // Cookie недоступны (sandbox, настройки) — считаем, что ответа нет.
      return "unknown";
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return override ?? readSafely();
    },

    decide(decision) {
      override = decision;

      try {
        jar.write(serializeConsentCookie(decision, jar.isSecure));
      } catch {
        // Запомнить не вышло — решение всё равно действует в этом визите.
      }

      listeners.forEach((listener) => listener());
    },
  };
}
