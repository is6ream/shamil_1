import Link from "next/link";

import { DonationsFeed } from "@/components/feed/DonationsFeed";
import type { FeedPage } from "@/lib/api/types";
import { FEED, PAGES } from "@/lib/content";

import styles from "./TwoColumns.module.css";

interface Props {
  readonly feed: FeedPage;
}

export function ReportsSection({ feed }: Props) {
  return (
    <section aria-labelledby="recent-donations-heading">
      <div className={styles.titleRow}>
        <h2 className={styles.title} id="recent-donations-heading">{FEED.title}</h2>
        <Link className={styles.titleLink} href={PAGES.reports.href} prefetch={false}>
          {FEED.allReports}
        </Link>
      </div>
      {feed.items.length === 0 ? (
        <p>В ленте пока нет записей.</p>
      ) : (
        <DonationsFeed initialPage={feed} />
      )}
    </section>
  );
}
