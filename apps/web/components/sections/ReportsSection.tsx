import Link from "next/link";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { RegionsBars } from "@/components/ranking/RegionsBars";
import type { FeedPage, RegionRankRow } from "@/lib/api/types";
import { FEED, PAGES, REGIONS } from "@/lib/content";

import styles from "./TwoColumns.module.css";

interface Props {
  readonly regions: readonly RegionRankRow[];
  readonly feed: FeedPage;
}

/** «География поддержки» + «Последние поступления» (макет v2). */
export function ReportsSection({ regions, feed }: Props) {
  return (
    <div className={styles.columns}>
      <div>
        <h2 className={styles.title}>{REGIONS.title}</h2>
        <RegionsBars regions={regions} />
      </div>

      <div>
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
