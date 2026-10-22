import type { CSSProperties, ReactNode } from "react";

import { AlertIcon, InboxIcon } from "./AdminIcons";
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

interface EmptyProps {
  readonly title: string;
  /** Кнопка или ссылка следующего шага: «Сбросить фильтры», «Загрузить фото». */
  readonly action?: ReactNode;
  readonly children?: ReactNode;
}

export function EmptyState({ title, action, children }: EmptyProps) {
  return (
    <div className={styles.state}>
      <span className={styles.icon} aria-hidden="true">
        <InboxIcon />
      </span>
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <AlertIcon />
      </span>
      <p className={styles.title}>{message}</p>
      <Button variant="ghost" isSmall onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

interface SkeletonProps {
  /** CSS-длины: `"60%"`, `"120px"`. */
  readonly width?: string;
  readonly height?: string;
  readonly isRound?: boolean;
}

/** Серая плашка на месте будущего содержимого. Скринридеру не видна — статус объявляет обёртка. */
export function Skeleton({ width = "100%", height = "1em", isRound = false }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${isRound ? styles.round : ""}`}
      style={{ width, height } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** Скелет сетки превью (медиатека): плитки той же формы, что и фото. */
export function SkeletonGrid({ count = 8, label = "Загружаем фото…" }: { readonly count?: number; readonly label?: string }) {
  return (
    <div className={styles.skeletonGrid} role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.skeletonTile}>
          <Skeleton height="auto" />
          <Skeleton width="70%" />
        </div>
      ))}
    </div>
  );
}

/** Скелет списка или таблицы: `rows` строк по форме контента, а не спиннер на весь экран. */
export function SkeletonRows({ rows = 5, label = "Загружаем…" }: { readonly rows?: number; readonly label?: string }) {
  return (
    <div className={styles.skeletonRows} role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton width="28%" />
          <Skeleton width="18%" />
          <Skeleton width="22%" />
        </div>
      ))}
    </div>
  );
}
