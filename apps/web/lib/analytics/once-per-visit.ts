/**
 * «Один раз за визит» для целей вроде `donate_form_view`: форма попадает
 * во вьюпорт при каждом скролле туда-обратно, а цель нужна одна.
 *
 * Визит — вкладка браузера (`sessionStorage`). Хранилище недоступно
 * (приватный режим, запрет сайта) — помним в памяти до перезагрузки.
 */

export interface VisitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY_PREFIX = "shamil_goal_";

export function createOncePerVisit(getStorage: () => VisitStorage | undefined) {
  const fired = new Set<string>();

  /** `true` — первый раз за визит, действие нужно выполнить. */
  return function claim(key: string): boolean {
    if (fired.has(key)) {
      return false;
    }

    fired.add(key);

    try {
      const storage = getStorage();

      if (storage === undefined) {
        return true;
      }

      if (storage.getItem(KEY_PREFIX + key) !== null) {
        return false;
      }

      storage.setItem(KEY_PREFIX + key, "1");
    } catch {
      // sessionStorage бросает в приватном режиме Safari — память уже помнит.
    }

    return true;
  };
}

export const claimOncePerVisit = createOncePerVisit(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage,
);
