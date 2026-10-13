/**
 * Политика пароля админки (API.md §4, §19): 12 символов … 72 байта UTF-8.
 * Кириллическая буква — 2 байта, поэтому русский пароль упирается ~в 36 символов.
 */

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "./endpoints";

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** `null` — пароль подходит. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Не короче ${PASSWORD_MIN_LENGTH} символов.`;
  }

  if (utf8Bytes(password) > PASSWORD_MAX_BYTES) {
    return "Слишком длинный пароль. Сократите его или используйте латиницу.";
  }

  return null;
}

export type PasswordStrength = "short" | "ok" | "good" | "long";

/** Для индикатора под полем: длина, а не «спецсимволы» — длинная фраза надёжнее. */
export function passwordStrength(password: string): PasswordStrength {
  if (utf8Bytes(password) > PASSWORD_MAX_BYTES) {
    return "long";
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return "short";
  }

  return password.length >= 16 ? "good" : "ok";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Случайный пароль из 16 знаков без похожих символов (0/O, 1/l/I) — продиктовать по телефону. */
export function generatePassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  // 256 не делится на 57 нацело — небольшой перекос допустим для одноразового пароля.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
