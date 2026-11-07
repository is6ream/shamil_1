/**
 * Типизированная обёртка Яндекс Метрики.
 *
 * Правило: ни один метод не бросает исключение наружу и не блокирует UI или
 * оплату. Нет номера счётчика, нет согласия, блокировщик срезал `tag.js` —
 * всё это no-op, а не ошибка. Ошибки — в `console.warn` и только в dev.
 *
 * Документация: https://yandex.ru/support/metrica/code/counter-spa-setup.html,
 * https://yandex.ru/support/metrica/objects/get-client-id.html,
 * https://yandex.ru/support/metrica/objects/reachgoal.html
 */
import { isTrackedPath } from "./tracked-paths";
import { isAnalyticsAllowed, parseConsent, CONSENT_COOKIE } from "./consent";
import { readCookie } from "@/lib/attribution";

import { METRIKA_CONFIG } from "./config";
import { sanitizeGoalParams } from "./goals";
import type { GoalParams, MetrikaGoal } from "./goals";

/** Функция `ym` счётчика: до загрузки `tag.js` — очередь вызовов. */
export interface YmFunction {
  (counterId: number, method: string, ...args: unknown[]): void;
  a?: unknown[][];
  l?: number;
}

declare global {
  interface Window {
    ym?: YmFunction;
  }
}

export const TAG_URL = "https://mc.yandex.ru/metrika/tag.js";

/** Cookie счётчика с ClientID — запасной путь, если `getClientID` не ответил. */
export const YM_UID_COOKIE = "_ym_uid";

export const CLIENT_ID_TIMEOUT_MS = 1_500;

const CLIENT_ID_PATTERN = /^[0-9]{1,32}$/;

/**
 * Сколько целей держать в памяти, пока человек не ответил на баннер.
 * Больше за один визит до ответа не бывает; предел — от утечки памяти.
 */
export const PENDING_GOALS_LIMIT = 20;

export interface HitOptions {
  readonly referer?: string;
}

/** Параметры `init`. `ecommerce` не включаем: dataLayer не используется (YAGNI). */
export interface InitOptions {
  readonly webvisor: boolean;
}

export interface Metrika {
  readonly isEnabled: boolean;
  /**
   * Счётчик принимает вызовы прямо сейчас: номер есть и `ym` установлен
   * (согласие получено). Цели «раз за визит» сами учитывают это —
   * см. `reachGoalOncePerVisit`.
   */
  isActive(): boolean;
  hit(url: string, options?: HitOptions): void;
  reachGoal(goal: MetrikaGoal, params?: GoalParams): void;
  /**
   * Цель «раз за визит» (`donate_form_view`). `claim` расходует флаг визита
   * и отвечает `true` только в первый раз. Флаг тратится в момент отправки:
   * до согласия цель ждёт в буфере (одна копия), а при отказе флаг цел.
   */
  reachGoalOncePerVisit(goal: MetrikaGoal, claim: (key: string) => boolean): void;
  params(visitParams: GoalParams): void;
  getClientId(timeoutMs?: number): Promise<string | null>;
  /**
   * Счётчик установлен (согласие получено): отправить цели, накопленные
   * до ответа на баннер, в порядке срабатывания.
   */
  flushPending(): void;
  /** Отказ от cookie: накопленные цели стереть, новые больше не копить. */
  discardPending(): void;
}

interface PendingGoal {
  readonly goal: MetrikaGoal;
  readonly params: GoalParams | undefined;
  /** Флаг визита для целей «раз за визит» — расходуется при отправке из буфера. */
  readonly claim?: (key: string) => boolean;
}

/** Окружение обёртки — подменяется в тестах. */
export interface MetrikaEnvironment {
  readonly getYm: () => YmFunction | undefined;
  readonly readCookie: (name: string) => string | undefined;
  readonly warn: (message: string, error?: unknown) => void;
}

/** ClientID — строка цифр; счётчик иногда отдаёт число. Остальное — `null`. */
export function normalizeClientId(value: unknown): string | null {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;

  return typeof text === "string" && CLIENT_ID_PATTERN.test(text.trim()) ? text.trim() : null;
}

export function createMetrika(counterId: number | null, env: MetrikaEnvironment): Metrika {
  let cachedClientId: string | null = null;
  /**
   * Цели до ответа на баннер — только в памяти вкладки: ни в cookie, ни
   * в storage они не пишутся и без согласия никуда не уходят.
   */
  let pending: PendingGoal[] = [];
  let isDiscarding = false;

  /** Вызов `ym`, который не может уронить страницу. */
  const call = (method: string, ...args: unknown[]): boolean => {
    const ym = counterId === null ? undefined : env.getYm();

    if (ym === undefined || counterId === null) {
      return false;
    }

    try {
      ym(counterId, method, ...args);

      return true;
    } catch (error: unknown) {
      env.warn(`Метрика: ${method} не выполнен`, error);

      return false;
    }
  };

  const sendGoal = (goal: MetrikaGoal, safe: GoalParams | undefined): void => {
    if (safe === undefined) {
      call("reachGoal", goal);
    } else {
      call("reachGoal", goal, safe);
    }
  };

  const enqueue = (entry: PendingGoal): void => {
    if (!isDiscarding && pending.length < PENDING_GOALS_LIMIT) {
      pending = [...pending, entry];
    }
  };

  const askCounter = (timeoutMs: number): Promise<string | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const isCalled = call("getClientID", (id: unknown) => {
        clearTimeout(timer);
        resolve(normalizeClientId(id));
      });

      if (!isCalled) {
        clearTimeout(timer);
        resolve(null);
      }
    });

  return {
    isEnabled: counterId !== null,

    isActive() {
      return counterId !== null && env.getYm() !== undefined;
    },

    hit(url, options) {
      call("hit", url, options?.referer === undefined ? {} : { referer: options.referer });
    },

    reachGoal(goal, params) {
      const safe = sanitizeGoalParams(params);

      if (counterId !== null && env.getYm() === undefined) {
        // Счётчика ещё нет: человек не ответил на баннер. Цель ждёт ответа.
        enqueue({ goal, params: safe });

        return;
      }

      sendGoal(goal, safe);
    },

    reachGoalOncePerVisit(goal, claim) {
      if (counterId === null) {
        return;
      }

      if (env.getYm() === undefined) {
        // Флаг визита не трогаем: без согласия цель может так и не уйти.
        if (!pending.some((entry) => entry.goal === goal && entry.claim !== undefined)) {
          enqueue({ goal, params: undefined, claim });
        }

        return;
      }

      if (claim(goal)) {
        sendGoal(goal, undefined);
      }
    },

    params(visitParams) {
      const safe = sanitizeGoalParams(visitParams);

      if (safe !== undefined) {
        call("params", safe);
      }
    },

    async getClientId(timeoutMs = CLIENT_ID_TIMEOUT_MS) {
      if (env.getYm() === undefined) { cachedClientId = null; return null; }
      if (cachedClientId !== null) {
        return cachedClientId;
      }

      // Без счётчика в этой сессии (нет согласия, выключено) ClientID не отдаём
      // даже из старой cookie: согласие отозвано — значит, и связывать нечего.
      if (counterId === null || env.getYm() === undefined) {
        return null;
      }

      const fromCounter = await askCounter(timeoutMs);
      if (env.getYm() === undefined) return null;
      const clientId = fromCounter ?? normalizeClientId(env.readCookie(YM_UID_COOKIE));

      cachedClientId = clientId;

      return clientId;
    },

    flushPending() {
      if (counterId === null || env.getYm() === undefined) {
        return;
      }

      const queued = pending;

      pending = [];
      isDiscarding = false;
      queued.forEach(({ goal, params, claim }) => {
        if (claim === undefined || claim(goal)) {
          sendGoal(goal, params);
        }
      });
    },

    discardPending() {
      pending = [];
      isDiscarding = true;
    },
  };
}

/**
 * Очередь `ym` и `init` — то же, что делает официальный код счётчика до
 * загрузки `tag.js`: вызовы копятся в `ym.a` и выполняются после загрузки.
 * `defer: true` — SPA: просмотры, включая первый, отправляем сами (`hit`).
 */
export function stopMetrika(target: Window, counterId: number): void {
  const ym = target.ym;
  if (!ym) return;
  // tag.js may still be downloading: remove init/hits/goals before it runs.
  if (ym.a) ym.a = ym.a.filter((args) => args[0] !== counterId);
  try { ym(counterId, "destruct"); } catch { /* Analytics must not break navigation. */ }
  initialized.delete(target);
}

const initialized = new WeakMap<Window, number>();

export function installMetrikaQueue(target: Window, counterId: number, options: InitOptions): void {
  if (target.ym === undefined) {
    const queue: YmFunction = (...args: [number, string, ...unknown[]]) => {
      (queue.a = queue.a ?? []).push(args);
    };

    queue.l = Date.now();
    target.ym = queue;
  }

  if (initialized.get(target) === counterId) return;
  initialized.set(target, counterId);
  target.ym(counterId, "init", {
    defer: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: options.webvisor,
  });
}

const browserEnvironment: MetrikaEnvironment = {
  getYm: () => {
    if (typeof window === "undefined" || !isTrackedPath(window.location.pathname)) return undefined;
    try {
      const consent = parseConsent(readCookie(document.cookie, CONSENT_COOKIE));
      return isAnalyticsAllowed(consent, METRIKA_CONFIG.requireConsent) ? window.ym : undefined;
    } catch { return undefined; }
  },
  readCookie: (name) => (typeof document === "undefined" ? undefined : readCookie(document.cookie, name)),
  warn: (message, error) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn(message, error);
    }
  },
};

/** Экземпляр приложения. Без номера счётчика — сплошной no-op. */
export const metrika: Metrika = createMetrika(METRIKA_CONFIG.counterId, browserEnvironment);
