"use client";

import { useState } from "react";

import { getFeed } from "@/lib/api/showcase";
import type { FeedItem, FeedPage } from "@/lib/api/types";
import { formatTimeOfDay } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./DonationsFeed.module.css";

interface Props {
  readonly initialPage: FeedPage;
}

/** Человекочитаемые названия способов из `donation.method`. */
const METHOD_LABELS: Readonly<Record<string, string>> = {
  sbp: "СБП",
  card: "Карта",
  sberpay: "SberPay",
  tpay: "T-Pay",
  bank_transfer: "Перевод",
  cash: "Наличные",
  kaspi: "Kaspi",
  mbank: "Mbank",
};

function describe(item: FeedItem): string {
  const who = item.donorName ?? "Аноним";

  return item.regionName === null ? who : `${who} · ${item.regionName}`;
}

/**
 * Живая лента поступлений — добавка сверх ТЗ, и она работает на слоган.
 *
 * Две функции: доказывает, что сайт живой, и нормализует малые суммы —
 * видно, что жертвуют по 10–100 ₽ и это нормально.
 *
 * Пагинацию на 2388 страниц, как у референса, не копируем: «Показать ещё»
 * и keyset-курсор. Первая страница приходит с сервера, следующие —
 * по кнопке, поэтому блок не задерживает первый экран.
 */
export function DonationsFeed({ initialPage }: Props) {
  const [items, setItems] = useState<readonly FeedItem[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Не удалось загрузить продолжение ленты");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <section id="feed">
      <div className="card">
        <h2>Последние поступления</h2>
        <p className="sub">Жертвуют по 10, 100, 500 — и это нормально. Время уфимское</p>

        <ul className="rank-list">
          {items.map((item) => (
            <li className="rank" key={item.id}>
              <div className="body">
                <div className={styles.when}>
                  {formatTimeOfDay(item.paidAt)}
                  {item.method === null
                    ? null
                    : ` · ${METHOD_LABELS[item.method] ?? item.method}`}
                </div>
                <div className="sum">{describe(item)}</div>
              </div>
              <div className="amt">{kopecksToRubDisplay(item.amountKopecks)}</div>
            </li>
          ))}
        </ul>

        {error === null ? null : <p className="field-error">{error}</p>}

        {cursor === null ? null : (
          <div className="cta">
            <button
              className="btn btn-ghost"
              type="button"
              aria-busy={isLoading}
              disabled={isLoading}
              onClick={() => {
                void loadMore();
              }}
            >
              {isLoading ? "Загружаем…" : "Показать ещё"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
