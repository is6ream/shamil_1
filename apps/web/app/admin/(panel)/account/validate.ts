import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/admin/endpoints";

export interface PasswordChangeDraft {
  readonly current: string;
  readonly next: string;
  readonly repeat: string;
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeDraft, string>>;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Проверка до отправки — те же правила, что в `ChangePasswordDto`; последнее слово за API. */
export function validatePasswordChange({ current, next, repeat }: PasswordChangeDraft): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};

  if (current === "") {
    errors.current = "Введите текущий пароль.";
  }

  if (next.length < PASSWORD_MIN_LENGTH) {
    errors.next = `Новый пароль — не короче ${PASSWORD_MIN_LENGTH} символов.`;
  } else if (utf8Bytes(next) > PASSWORD_MAX_BYTES) {
    // Кириллическая буква — 2 байта, так что русский пароль упирается примерно в 36 символов.
    errors.next = "Пароль слишком длинный. Сократите его или используйте латиницу.";
  } else if (next === current) {
    errors.next = "Новый пароль совпадает с текущим.";
  }

  if (repeat !== next) {
    errors.repeat = "Пароли не совпадают.";
  }

  return errors;
}
