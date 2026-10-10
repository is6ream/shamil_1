import type { ReactNode } from "react";

import { FALLBACK_CONTENT, getSiteContent } from "@/lib/api/site-content";
import { withFallback } from "@/lib/api/with-fallback";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import styles from "./SimplePage.module.css";

interface Props {
  readonly title: string;
  readonly lede?: string;
  readonly children?: ReactNode;
}

/**
 * Каркас служебной страницы: общая шапка, заголовок, содержимое, футер.
 * Телефон и контакты — из админки (тег `content`), без API — хардкод.
 */
export async function SimplePage({ title, lede, children }: Props) {
  const content = await withFallback(getSiteContent(), FALLBACK_CONTENT, "тексты сайта");

  return (
    <>
      <SiteHeader phone={content.contacts.phone} helpButton={content.hero.helpButton} />
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {lede === undefined ? null : <p className={styles.lede}>{lede}</p>}
        {children === undefined ? null : <div className={styles.body}>{children}</div>}
      </main>
      <SiteFooter contacts={content.contacts} />
    </>
  );
}
