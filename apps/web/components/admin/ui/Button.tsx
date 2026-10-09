import type { ButtonHTMLAttributes } from "react";

import styles from "./Button.module.css";

type Variant = "primary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: Variant;
  /** Идёт запрос: кнопка неактивна, крутится спиннер (`.spinner` из kit.css). */
  readonly isBusy?: boolean;
  readonly isSmall?: boolean;
};

const VARIANT_CLASS: Readonly<Record<Variant, string>> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: `btn-primary ${styles.danger}`,
};

/** Кнопки сайта (`.btn` из kit.css) с состоянием «отправляется». */
export function Button({
  variant = "primary",
  isBusy = false,
  isSmall = false,
  type = "button",
  className,
  disabled,
  children,
  ...rest
}: Props) {
  const classes = ["btn", VARIANT_CLASS[variant], isSmall ? "btn-sm" : "", className ?? ""];

  return (
    <button
      {...rest}
      type={type}
      className={classes.filter(Boolean).join(" ")}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
    >
      {isBusy ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
