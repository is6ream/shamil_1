"use client";

import { useState } from "react";
import type { ComponentProps } from "react";

import { TextField } from "./Field";
import styles from "./PasswordInput.module.css";

type Props = Omit<ComponentProps<typeof TextField>, "type" | "trailing">;

/**
 * Поле пароля с «Показать / Скрыть»: на телефоне пароль часто набирают
 * с ошибкой, и проверить его глазами быстрее, чем перепечатывать.
 * Скрытым пароль становится снова при каждом открытии формы.
 */
export function PasswordInput(props: Props) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={isVisible ? "text" : "password"}
      spellCheck={false}
      autoCapitalize="off"
      trailing={
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={isVisible}
          aria-label={isVisible ? `Скрыть: ${props.label}` : `Показать: ${props.label}`}
          onClick={() => setIsVisible((value) => !value)}
        >
          {isVisible ? "Скрыть" : "Показать"}
        </button>
      }
    />
  );
}
