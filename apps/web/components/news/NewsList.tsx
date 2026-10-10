import Link from "next/link";

import type { NewsListItem } from "@/lib/api/site-content";
import { formatDayMonth } from "@/lib/format";

import styles from "./News.module.css";

/** Список новостей стройки на `/otchety` (D-12). Пустой — не рисуется вовсе. */
export function NewsList({ items }: { readonly items: readonly NewsListItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className={styles.list} aria-labelledby="news-title">
      <h2 className={styles.listTitle} id="news-title">
        Новости стройки
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.slug} className={styles.item}>
            <time className={styles.date} dateTime={item.publishedAt}>
              {formatDayMonth(item.publishedAt)}
            </time>
            <Link href={`/novosti/${encodeURIComponent(item.slug)}`} className={styles.link}>
              {item.title}
            </Link>
            {item.excerpt ? <p className={styles.excerpt}>{item.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
