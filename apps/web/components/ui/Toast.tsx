import styles from "./Toast.module.css";

interface Props {
  /** Текст тоста; `null` — тоста нет, но live-регион остаётся в DOM. */
  readonly message: string | null;
}

/**
 * Всплывающее подтверждение внизу экрана.
 *
 * Live-регион рендерится всегда, а меняется только его текст: регион,
 * вставленный в DOM одновременно с текстом, скринридеры часто пропускают.
 */
export function Toast({ message }: Props) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {message === null ? null : <p className={styles.toast}>{message}</p>}
    </div>
  );
}
