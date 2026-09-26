import type { ReactNode } from "react";

import { CheckMarkIcon } from "@/components/icons/Icons";

import styles from "./Checkbox.module.css";

interface Props {
  readonly id: string;
  readonly name: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: ReactNode;
  readonly errorId?: string;
  readonly isInvalid?: boolean;
}

/**
 * Чекбокс макета v2: квадрат 22px с галочкой. Настоящий `input` под
 * визуальным квадратом — иначе форма непроходима с клавиатуры.
 *
 * Подпись — не `<label>` вокруг всего: внутри подписи согласия лежат
 * ссылки, а клик по ссылке внутри `<label>` заодно переключал бы галочку.
 */
export function Checkbox({ id, name, checked, onChange, children, errorId, isInvalid }: Props) {
  return (
    <div className={styles.row}>
      <span className={styles.box}>
        <input
          className={styles.input}
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          aria-invalid={isInvalid === true ? true : undefined}
          aria-describedby={isInvalid === true ? errorId : undefined}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <CheckMarkIcon className={styles.mark} />
      </span>
      <label className={styles.label} htmlFor={id}>
        {children}
      </label>
    </div>
  );
}
