import Link from "next/link";
import type { ReactNode } from "react";

import { ChevronRightIcon } from "./ui/AdminIcons";
import styles from "./AdminPage.module.css";

export interface Crumb {
  readonly href: string;
  readonly label: string;
}

interface Props {
  readonly title: string;
  /** Что здесь делать — одной-двумя фразами. */
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  /** Путь до вложенной страницы: «Пожертвования › № 1024». Текущая — `title`. */
  readonly breadcrumbs?: readonly Crumb[];
  /** Таблицы с многими столбцами — на всю ширину рабочей области. */
  readonly isWide?: boolean;
  readonly children: ReactNode;
}

/** Заголовок экрана кабинета: крошки, название, пояснение, действия справа. */
export function AdminPage({ title, lead, actions, breadcrumbs, isWide = false, children }: Props) {
  return (
    <div className={`${styles.page} ${isWide ? styles.wide : ""}`}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Вы здесь" className={styles.crumbs}>
          <ol>
            {breadcrumbs.map((crumb) => (
              <li key={crumb.href}>
                <Link href={crumb.href}>{crumb.label}</Link>
                <ChevronRightIcon className={styles.crumbSep} />
              </li>
            ))}
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
      ) : null}
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
