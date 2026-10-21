"use client";

import { useState } from "react";

import { ErrorState, Skeleton } from "@/components/admin/ui/StateViews";
import { resolvePeriod } from "@/lib/admin/dashboard";
import type { DashboardPeriod } from "@/lib/admin/dashboard";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import type { Dashboard } from "@/lib/admin/types";

import { CampaignSummary } from "./CampaignSummary";
import styles from "./dashboard.module.css";
import { MonthlySection } from "./MonthlySection";
import { PeriodSection } from "./PeriodSection";
import { RecentDonations } from "./RecentDonations";

function SummarySkeleton() {
  return (
    <div className={styles.kpis} role="status">
      <span className="sr-only">Загружаем сводку…</span>
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.kpi}>
          <Skeleton width="45%" />
          <Skeleton width="70%" height="1.8em" />
          <Skeleton width="100%" height="8px" />
        </div>
      ))}
    </div>
  );
}

/** «Обзор» (API.md §15): сводка сбора, период с разрезами, месяцы, последние оплаты. */
export function DashboardOverview() {
  const [period, setPeriod] = useState<DashboardPeriod>({ preset: "30", from: "", to: "" });
  // Пресеты считаются от «сейчас»: фиксируем момент открытия экрана, чтобы
  // путь запроса не менялся на каждом рендере и не перезапрашивал данные.
  const [now] = useState(() => Date.now());
  const anchored = resolvePeriod(period, now);
  const path = anchored.ok ? withQuery(ADMIN_PATHS.dashboard, anchored.period.params) : null;
  const { data, error, isLoading, reload } = useAdminQuery<Dashboard>(path);

  return (
    <div className={styles.overview}>
      {data ? <CampaignSummary data={data} now={now} /> : null}
      {isLoading && data === null ? <SummarySkeleton /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      <PeriodSection period={period} onPeriodChange={setPeriod} anchored={anchored} data={data} />
      <MonthlySection now={now} />
      {data ? <RecentDonations recent={data.recent} now={now} /> : null}
    </div>
  );
}
