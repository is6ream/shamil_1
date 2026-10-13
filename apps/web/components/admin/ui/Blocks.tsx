import type { CSSProperties, ReactNode } from "react";

import { clampPercent } from "@/lib/money";

import styles from "./Blocks.module.css";

/** Мелкие строительные блоки экранов админки. */

interface SectionProps {
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Белая карточка раздела с необязательным заголовком и кнопками справа. */
export function Section({ title, actions, children }: SectionProps) {
  return (
    <section className={styles.section}>
      {title || actions ? (
        <div className={styles.sectionHead}>
          {title ? <h2 className={styles.sectionTitle}>{title}</h2> : <span />}
          {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Поля в две колонки на широком экране, одна — на телефоне. */
export function FieldGrid({ children }: { readonly children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

/** Ряд кнопок под формой; на телефоне — во всю ширину. */
export function FormActions({ children }: { readonly children: ReactNode }) {
  return <div className={styles.formActions}>{children}</div>;
}

export interface KeyValueRow {
  readonly label: string;
  readonly value: ReactNode;
}

/** Список «подпись — значение» для карточек записи. */
export function KeyValueList({ rows }: { readonly rows: readonly KeyValueRow[] }) {
  return (
    <dl className={styles.kv}>
      {rows.map((row) => (
        <div key={row.label} className={styles.kvRow}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

/** Плашка статуса: «Оплачено», «Черновик», «Скрыто». */
export function Badge({ tone = "neutral", children }: { readonly tone?: BadgeTone; readonly children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

interface MeterProps {
  readonly label: string;
  readonly percent: number;
}

/** Шкала прогресса сайта (`.track` из kit.css) с подписью для скринридера. */
export function Meter({ label, percent }: MeterProps) {
  const width = clampPercent(percent);

  return (
    <div
      className="track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <span className="fill" style={{ "--p": `${width}%` } as CSSProperties} />
    </div>
  );
}

/** Подсказка-врезка: предупреждения и пояснения в формах. */
export function Note({ tone = "info", children }: { readonly tone?: "info" | "warning"; readonly children: ReactNode }) {
  return (
    <div className={`${styles.note} ${tone === "warning" ? styles.noteWarning : ""}`} role="note">
      {children}
    </div>
  );
}
