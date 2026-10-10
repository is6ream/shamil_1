"use client";

import { Button } from "@/components/admin/ui/Button";
import { TextField } from "@/components/admin/ui/Field";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/admin/endpoints";
import { generatePassword, passwordStrength, utf8Bytes } from "@/lib/admin/password";

import styles from "./users.module.css";

const STRENGTH_TEXT = {
  short: `Короче ${PASSWORD_MIN_LENGTH} символов`,
  ok: "Подходит",
  good: "Надёжный",
  long: "Слишком длинный",
} as const;

interface Props {
  readonly label: string;
  readonly value: string;
  readonly error?: string | null;
  readonly onChange: (value: string) => void;
}

/**
 * Пароль, который суперадмин задаёт другому человеку: виден открытым текстом
 * (его надо передать), есть кнопка «Придумать» и индикатор длины в байтах.
 */
export function PasswordField({ label, value, error, onChange }: Props) {
  const strength = passwordStrength(value);

  return (
    <div className={styles.password}>
      <TextField
        label={label}
        type="text"
        autoComplete="new-password"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        hint={`От ${PASSWORD_MIN_LENGTH} символов. Передайте человеку лично, не в общий чат.`}
      />
      <div className={styles.passwordMeta}>
        <span className={`${styles.strength} ${styles[strength]}`} aria-live="polite">
          {value === "" ? "" : `${STRENGTH_TEXT[strength]} · ${utf8Bytes(value)}/${PASSWORD_MAX_BYTES} байт`}
        </span>
        <Button variant="ghost" isSmall onClick={() => onChange(generatePassword())}>
          Придумать
        </Button>
      </div>
    </div>
  );
}
