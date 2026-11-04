/**
 * Метка «в этом браузере входили в кабинет». Не секрет и не токен —
 * только повод спросить API. Отдельным модулем, без клиента и React:
 * её читают шапка и форма доната, а код кабинета грузится лениво (D-F11).
 */

const HINT_KEY = "shamil_donor_session";

export function hasDonorHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDonorHint(isSignedIn: boolean): void {
  try {
    if (isSignedIn) {
      window.localStorage.setItem(HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(HINT_KEY);
    }
  } catch {
    // Приватный режим: без метки форма доната просто не подставит имя.
  }
}
