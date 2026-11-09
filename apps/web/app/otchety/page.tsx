import type { Metadata } from "next";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { SimplePage } from "@/components/layout/SimplePage";
import { NewsList } from "@/components/news/NewsList";
import { getFeed } from "@/lib/api/showcase";
import { getLatestNews } from "@/lib/api/site-content";
import { withFallback } from "@/lib/api/with-fallback";
import { PAGES, REPORTS_PAGE } from "@/lib/content";

export const metadata: Metadata = {
  title: PAGES.reports.title,
};

/**
 * Все поступления с «Показать ещё» по keyset-курсору.
 *
 * TODO(заказчик): отчёты о расходах по этапам стройки — документами
 * или таблицей. Пока страница показывает приход, а не расход.
 */
/** Свежая лента при открытии; новости сохраняют свой кеш в API-слое. */
export const revalidate = 0;

export default async function ReportsPage() {
  const [feed, news] = await Promise.all([
    withFallback(getFeed(), { items: [], nextCursor: null }, "лента поступлений"),
    // Пока опубликованных новостей нет, блок не рисуется и страница прежняя (D-12).
    withFallback(getLatestNews(), [], "новости"),
  ]);

  return (
    <SimplePage title={REPORTS_PAGE.title} lede={REPORTS_PAGE.lede}>
      <NewsList items={news} />
      <DonationsFeed initialPage={feed} canLoadMore />
    </SimplePage>
  );
}
