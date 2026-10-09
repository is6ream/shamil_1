import type { ReactNode } from "react";

import styles from "./AdminPage.module.css";

interface Props {
  readonly title: string;
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  /** Таблицы с многими столбцами — на всю ширину рабочей области. */
  readonly isWide?: boolean;
  readonly children: ReactNode;
}

/** Заголовок экрана админки и колонка контента. */
export function AdminPage({ title, lead, actions, isWide = false, children }: Props) {
  return (
    <div className={`${styles.page} ${isWide ? styles.wide : ""}`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
