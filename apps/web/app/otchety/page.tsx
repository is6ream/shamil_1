import type { Metadata } from "next";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { SimplePage } from "@/components/layout/SimplePage";
import { getFeed } from "@/lib/api/showcase";
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
export default async function ReportsPage() {
  const feed = await getFeed();

  return (
    <SimplePage title={REPORTS_PAGE.title} lede={REPORTS_PAGE.lede}>
      <DonationsFeed initialPage={feed} canLoadMore />
    </SimplePage>
  );
}
