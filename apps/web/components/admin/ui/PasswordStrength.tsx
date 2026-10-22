import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/admin/endpoints";
import { passwordStrength } from "@/lib/admin/password";
import type { PasswordStrength as Strength } from "@/lib/admin/password";

import styles from "./PasswordStrength.module.css";

const TEXT: Readonly<Record<Strength, string>> = {
  short: `Слишком короткий — нужно от ${PASSWORD_MIN_LENGTH} символов`,
  ok: "Подходит",
  good: "Надёжный",
  long: `Слишком длинный — больше ${PASSWORD_MAX_BYTES} байт. Сократите или используйте латиницу`,
};

/** Сколько делений шкалы закрашено. */
const LEVEL: Readonly<Record<Strength, number>> = { short: 1, ok: 2, good: 3, long: 0 };

/**
 * Шкала под новым паролем. Меряет длину — ту же, что проверяет API, —
 * а не «спецсимволы»: длинная фраза надёжнее короткого «P@ssw0rd».
 */
export function PasswordStrength({ value }: { readonly value: string }) {
  if (value === "") {
    return null;
  }

  const strength = passwordStrength(value);

  return (
    <div className={styles.strength} data-strength={strength}>
      <span className={styles.bars} aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={bar <= LEVEL[strength] ? styles.on : undefined} />
        ))}
      </span>
      <span aria-live="polite">{TEXT[strength]}</span>
    </div>
  );
}
