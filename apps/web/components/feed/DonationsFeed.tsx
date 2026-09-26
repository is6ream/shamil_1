"use client";

import { useState } from "react";

import { getFeed } from "@/lib/api/showcase";
import type { FeedItem, FeedPage } from "@/lib/api/types";
import { FEED } from "@/lib/content";
import {
  formatDayMonthNumeric,
  formatRelativeDay,
  formatTimeOfDay,
  paymentMethodLabel,
} from "@/lib/format";
import { useClientNow } from "@/lib/hooks/useClientNow";
import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./DonationsFeed.module.css";

interface Props {
  readonly initialPage: FeedPage;
  /** «Показать ещё» — на странице отчётов; на главной ровно шесть строк. */
  readonly canLoadMore?: boolean;
}

/**
 * Жирная строка записи: имя, если человек снял анонимность; иначе регион;
 * иначе «Анонимное пожертвование» (макет v2).
 */
function titleOf(item: FeedItem): string {
  return item.donorName ?? item.regionName ?? FEED.anonymous;
}

function whenOf(item: FeedItem, now: number | null): string {
  const day = now === null ? formatDayMonthNumeric(item.paidAt) : formatRelativeDay(item.paidAt, now);
  const method = paymentMethodLabel(item.method);
  const when = `${day}, ${formatTimeOfDay(item.paidAt)}`;

  return method === null ? when : `${when} · ${method}`;
}

/**
 * Живая лента поступлений — добавка сверх ТЗ, и она работает на слоган:
 * видно, что жертвуют по 10–100 ₽ и это нормально.
 *
 * Пагинацию на 2388 страниц, как у референса, не копируем: «Показать ещё»
 * и keyset-курсор. Первая страница приходит с сервера.
 */
export function DonationsFeed({ initialPage, canLoadMore = false }: Props) {
  const [items, setItems] = useState<readonly FeedItem[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClientNow();

  const loadMore = async () => {
    if (cursor === null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const page = await getFeed(cursor);

      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError("Не удалось загрузить продолжение ленты. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.row} key={item.id}>
            <div>
              <p className={styles.title}>{titleOf(item)}</p>
              <p className={styles.when}>
                <time dateTime={item.paidAt}>{whenOf(item, now)}</time>
              </p>
            </div>
            <p className={styles.amount}>{kopecksToRubDisplay(item.amountKopecks)}</p>
          </li>
        ))}
      </ul>

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {canLoadMore && cursor !== null ? (
        <button
          className={`btn btn-ghost ${styles.more}`}
          type="button"
          aria-busy={isLoading}
          disabled={isLoading}
          onClick={() => {
            void loadMore();
          }}
        >
          {isLoading ? "Загружаем…" : FEED.showMore}
        </button>
      ) : null}
    </>
  );
}
