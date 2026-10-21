"use client";

import Link from "next/link";

import { Section } from "@/components/admin/ui/Blocks";
import { EmptyState } from "@/components/admin/ui/StateViews";
import { methodLabel, providerLabel } from "@/lib/admin/labels";
import { formatKopecks } from "@/lib/admin/money";
import type { Dashboard } from "@/lib/admin/types";
import { formatRelativeDay, formatTimeOfDay } from "@/lib/format";

import styles from "./dashboard.module.css";

/** Десять последних оплат — лентой, а не таблицей: на телефоне читается без прокрутки вбок. */
export function RecentDonations({ recent, now }: { readonly recent: Dashboard["recent"]; readonly now: number }) {
  return (
    <Section title="Последние поступления" actions={<Link href="/admin/donations">Все пожертвования →</Link>}>
      {recent.length === 0 ? (
        <EmptyState title="Оплаченных поступлений пока нет." />
      ) : (
        <ul className={styles.feed}>
          {recent.map((row) => (
            <li key={row.id}>
              <Link href={`/admin/donations/${row.id}`} className={styles.feedRow}>
                <span className={styles.feedMain}>
                  <strong className={styles.feedAmount}>{formatKopecks(row.paidAmountKopecks)}</strong>
                  <span className={styles.feedWho}>
                    {row.donorName ?? "Анонимно"}
                    {row.regionName ? ` · ${row.regionName}` : ""}
                  </span>
                </span>
                <span className={styles.feedMeta}>
                  <span>
                    {formatRelativeDay(row.paidAt, now)}, {formatTimeOfDay(row.paidAt)}
                  </span>
                  <span>
                    {methodLabel(row.method)} · {row.provider === "manual" ? "внесено вручную" : providerLabel(row.provider)} · №{" "}
                    {row.invoiceNo}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
