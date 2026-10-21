"use client";

import Link from "next/link";

import { Meter } from "@/components/admin/ui/Blocks";
import { formatKopecks, percentOf } from "@/lib/admin/money";
import { useAdminSession } from "@/lib/admin/session";
import { daysInclusive, formatPlainDate, ufaDayKey } from "@/lib/admin/time";
import type { Dashboard } from "@/lib/admin/types";
import { formatRelativeDay, formatTimeOfDay, pluralize } from "@/lib/format";

import styles from "./dashboard.module.css";

interface Props {
  readonly data: Dashboard;
  /** Момент открытия экрана — для «сегодня/вчера» и «осталось дней». */
  readonly now: number;
}

function MonthlyGoalCard({ goal, now }: { readonly goal: NonNullable<Dashboard["monthlyGoal"]>; readonly now: number }) {
  const percent = percentOf(goal.collectedKopecks, goal.goalKopecks);
  const today = ufaDayKey(now);
  const daysLeft = today <= goal.periodEnd ? daysInclusive(today, goal.periodEnd) : 0;

  return (
    <>
      <p className={styles.metricValue}>
        {formatKopecks(goal.collectedKopecks)}
        <span className={styles.metricOf}> из {formatKopecks(goal.goalKopecks)}</span>
      </p>
      <Meter label="Собрано от цели месяца" percent={percent} />
      <p className={styles.metricNote}>
        {percent.toLocaleString("ru-RU")}% · {formatPlainDate(goal.periodStart)} — {formatPlainDate(goal.periodEnd)}
        {daysLeft > 0 ? ` · осталось ${pluralize(daysLeft, ["день", "дня", "дней"])}` : " · период закончился"}
      </p>
    </>
  );
}

/** Три карточки сверху: весь сбор, цель месяца, последнее поступление. */
export function CampaignSummary({ data, now }: Props) {
  const { can } = useAdminSession();
  const { campaign, monthlyGoal } = data;
  const total = percentOf(campaign.collectedKopecks, campaign.goalKopecks);

  return (
    <div className={styles.kpis}>
      <section className={styles.kpi} aria-labelledby="kpi-total">
        <h2 id="kpi-total" className={styles.metricLabel}>
          Собрано на стройку
        </h2>
        <p className={styles.metricValue}>{formatKopecks(campaign.collectedKopecks)}</p>
        <Meter label="Собрано от общей цели" percent={total} />
        <p className={styles.metricNote}>
          {total.toLocaleString("ru-RU")}% из {formatKopecks(campaign.goalKopecks)}
        </p>
      </section>

      <section className={styles.kpi} aria-labelledby="kpi-month">
        <h2 id="kpi-month" className={styles.metricLabel}>
          Цель месяца
        </h2>
        {monthlyGoal ? (
          <MonthlyGoalCard goal={monthlyGoal} now={now} />
        ) : (
          <p className={styles.metricNote}>
            Не задана — на сайте видна только общая шкала, а она на старте показывает доли процента.{" "}
            {can("goals") ? <Link href="/admin/goals">Задать цель месяца</Link> : null}
          </p>
        )}
      </section>

      <section className={styles.kpi} aria-labelledby="kpi-last">
        <h2 id="kpi-last" className={styles.metricLabel}>
          Последнее поступление
        </h2>
        <p className={styles.metricValue}>
          {campaign.lastPaidAt
            ? `${formatRelativeDay(campaign.lastPaidAt, now)}, ${formatTimeOfDay(campaign.lastPaidAt)}`
            : "Пока не было"}
        </p>
        <p className={styles.metricNote}>
          Всего {pluralize(campaign.donationsCount, ["пожертвование", "пожертвования", "пожертвований"])}
        </p>
      </section>
    </div>
  );
}
