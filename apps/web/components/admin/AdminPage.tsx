import type { ReactNode } from "react";

import styles from "./AdminPage.module.css";

interface Props {
  readonly title: string;
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Заголовок экрана админки и колонка контента. */
export function AdminPage({ title, lead, actions, children }: Props) {
  return (
    <div className={styles.page}>
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
