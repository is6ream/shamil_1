import Link from "next/link";
import { Suspense } from "react";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { RegionRanking } from "@/components/ranking/RegionRanking";
import type { FeedPage, RegionRankRow } from "@/lib/api/types";
import { FEED, PAGES } from "@/lib/content";

import styles from "./TwoColumns.module.css";
import reports from "./ReportsSection.module.css";

interface Props {
  readonly regions: Promise<readonly RegionRankRow[] | null>;
  readonly feed: FeedPage;
}

async function RankingContent({ regions }: Pick<Props, "regions">) {
  return <RegionRanking regions={await regions} />;
}

export function ReportsSection({ regions, feed }: Props) {
  return (
    <div className={`${styles.columns} ${reports.columns}`}>
      <section className={reports.ranking} aria-labelledby="region-ranking-heading">
        <h2 className={styles.title} id="region-ranking-heading">Топ регионов поддержки</h2>
        <Suspense fallback={<p role="status">Загружаем рейтинг регионов…</p>}>
          <RankingContent regions={regions} />
        </Suspense>
      </section>

      <div className={reports.feed}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{FEED.title}</h2>
          <Link className={styles.titleLink} href={PAGES.reports.href}>
            {FEED.allReports}
          </Link>
        </div>
        <DonationsFeed initialPage={feed} />
      </div>
    </div>
  );
}
