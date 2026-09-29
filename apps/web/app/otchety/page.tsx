import type { Metadata } from "next";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { SimplePage } from "@/components/layout/SimplePage";
import { getFeed } from "@/lib/api/showcase";
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
/** Лента живёт так же, как на главной: не реже раза в 15 секунд. */
export const revalidate = 15;

export default async function ReportsPage() {
  const feed = await withFallback(getFeed(), { items: [], nextCursor: null }, "лента поступлений");

  return (
    <SimplePage title={REPORTS_PAGE.title} lede={REPORTS_PAGE.lede}>
      <DonationsFeed initialPage={feed} canLoadMore />
    </SimplePage>
  );
}
