import type { ReactNode } from "react";

import { Button } from "./Button";
import styles from "./StateViews.module.css";

/** Три состояния любого экрана с данными: загрузка, пусто, ошибка. */

export function LoadingState({ label = "Загружаем…" }: { readonly label?: string }) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <p className={styles.title}>{message}</p>
      <Button variant="ghost" isSmall onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}
