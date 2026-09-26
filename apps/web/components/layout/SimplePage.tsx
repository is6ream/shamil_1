import type { ReactNode } from "react";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import styles from "./SimplePage.module.css";

interface Props {
  readonly title: string;
  readonly lede?: string;
  readonly children?: ReactNode;
}

/** Каркас служебной страницы: общая шапка, заголовок, содержимое, футер. */
export function SimplePage({ title, lede, children }: Props) {
  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {lede === undefined ? null : <p className={styles.lede}>{lede}</p>}
        {children === undefined ? null : <div className={styles.body}>{children}</div>}
      </main>
      <SiteFooter />
    </>
  );
}
