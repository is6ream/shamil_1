import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import field from "@/components/ui/field.module.css";

import styles from "./Field.module.css";

/**
 * Поля админки поверх общего `field.module.css` формы доната: высота поля,
 * цвет ошибки и подписи совпадают с сайтом. Подпись связана с полем через
 * `htmlFor`, ошибка и подсказка — через `aria-describedby`.
 */

interface FieldFrameProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string | null;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}

/** Подсказку прячем, пока есть ошибка: обычно ошибка её же и повторяет. */
function describedBy(id: string, error?: string | null, hint?: ReactNode): string | undefined {
  if (error) {
    return `${id}-error`;
  }

  return hint ? `${id}-hint` : undefined;
}

function FieldFrame({ id, label, error, hint, children }: FieldFrameProps) {
  return (
    <div className={styles.field}>
      <label className={field.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className={field.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={field.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  readonly label: string;
  readonly error?: string | null;
  readonly hint?: ReactNode;
};

export function TextField({ label, error, hint, className, ...input }: TextFieldProps) {
  const id = useId();

  return (
    <FieldFrame id={id} label={label} error={error} hint={hint}>
      <input
        {...input}
        id={id}
        className={`${field.input} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
    </FieldFrame>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  readonly label: string;
  readonly error?: string | null;
  readonly hint?: ReactNode;
};

export function TextAreaField({ label, error, hint, className, ...textarea }: TextAreaFieldProps) {
  const id = useId();

  return (
    <FieldFrame id={id} label={label} error={error} hint={hint}>
      <textarea
        {...textarea}
        id={id}
        className={`${field.input} ${styles.textarea} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
    </FieldFrame>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  readonly label: string;
  readonly options: readonly SelectOption[];
  /** Пустой пункт в начале: «Все», «Не выбран». */
  readonly emptyLabel?: string;
  readonly error?: string | null;
  readonly hint?: ReactNode;
};

export function SelectField({ label, options, emptyLabel, error, hint, className, ...select }: SelectFieldProps) {
  const id = useId();

  return (
    <FieldFrame id={id} label={label} error={error} hint={hint}>
      <select
        {...select}
        id={id}
        className={`${field.input} ${styles.select} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      >
        {emptyLabel === undefined ? null : <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
};

/** Чекбокс с подписью справа; вся строка — цель касания не ниже 46 px. */
export function CheckboxField({ label, hint, className, ...input }: CheckboxFieldProps) {
  const id = useId();

  return (
    <div className={`${styles.check} ${className ?? ""}`}>
      <input
        {...input}
        id={id}
        type="checkbox"
        className={styles.checkbox}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className={`${field.hint} ${styles.checkHint}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Ошибки сервера списком под формой: class-validator может вернуть несколько. */
export function FormErrors({ messages }: { readonly messages: readonly string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={styles.formErrors} role="alert">
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
