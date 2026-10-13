"use client";

import Link from "next/link";
import { useState } from "react";

import { Meter, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { DataTable } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { TextField } from "@/components/admin/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { fillDays, resolvePeriod } from "@/lib/admin/dashboard";
import type { DashboardPeriod, PeriodPreset } from "@/lib/admin/dashboard";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { methodLabel, providerLabel } from "@/lib/admin/labels";
import { formatKopecks, percentOf } from "@/lib/admin/money";
import { withQuery } from "@/lib/admin/query";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime, formatPlainDate } from "@/lib/admin/time";
import type { Dashboard } from "@/lib/admin/types";
import { formatCount } from "@/lib/format";

import styles from "./dashboard.module.css";
import { DayChart } from "./DayChart";

type UtmRow = Dashboard["byUtm"][number];
type MethodRow = Dashboard["byMethod"][number];
type RecentRow = Dashboard["recent"][number];

const PRESETS: readonly { readonly value: PeriodPreset; readonly label: string }[] = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" },
  { value: "custom", label: "Свой период" },
];

const UTM_COLUMNS: readonly Column<UtmRow>[] = [
  { key: "source", header: "Источник", render: (row) => row.source ?? "без метки" },
  { key: "medium", header: "Канал", render: (row) => row.medium ?? "—" },
  { key: "campaign", header: "Кампания", render: (row) => row.campaign ?? "—" },
  { key: "count", header: "Поступлений", isNumeric: true, render: (row) => formatCount(row.count) },
  { key: "total", header: "Сумма", isNumeric: true, render: (row) => formatKopecks(row.totalKopecks) },
];

const METHOD_COLUMNS: readonly Column<MethodRow>[] = [
  { key: "method", header: "Способ", render: (row) => methodLabel(row.method) },
  { key: "count", header: "Поступлений", isNumeric: true, render: (row) => formatCount(row.count) },
  { key: "total", header: "Сумма", isNumeric: true, render: (row) => formatKopecks(row.totalKopecks) },
];

const RECENT_COLUMNS: readonly Column<RecentRow>[] = [
  {
    key: "invoice",
    header: "№",
    render: (row) => <Link href={`/admin/donations/${row.id}`}>{`№ ${row.invoiceNo}`}</Link>,
  },
  { key: "paidAt", header: "Оплачено", render: (row) => formatDateTime(row.paidAt) },
  { key: "amount", header: "Сумма", isNumeric: true, render: (row) => formatKopecks(row.paidAmountKopecks) },
  {
    key: "method",
    header: "Способ",
    render: (row) => `${methodLabel(row.method)} · ${providerLabel(row.provider)}`,
  },
  { key: "region", header: "Регион", render: (row) => row.regionName ?? "—" },
  { key: "donor", header: "Подпись", render: (row) => row.donorName ?? "Анонимно" },
];

function CampaignProgress({ data }: { readonly data: Dashboard }) {
  const { can } = useAdminSession();
  const { campaign, monthlyGoal } = data;
  const total = percentOf(campaign.collectedKopecks, campaign.goalKopecks);

  return (
    <div className={styles.progress}>
      <div>
        <p className={styles.metricLabel}>Собрано на стройку</p>
        <p className={styles.metricValue}>{formatKopecks(campaign.collectedKopecks)}</p>
        <Meter label="Собрано от общей цели" percent={total} />
        <p className={styles.metricNote}>
          {total.toLocaleString("ru-RU")}% из {formatKopecks(campaign.goalKopecks)} ·{" "}
          {formatCount(campaign.donationsCount)} пожертвований
        </p>
      </div>
      <div>
        <p className={styles.metricLabel}>Цель месяца</p>
        {monthlyGoal ? (
          <>
            <p className={styles.metricValue}>{formatKopecks(monthlyGoal.collectedKopecks)}</p>
            <Meter
              label="Собрано от цели месяца"
              percent={percentOf(monthlyGoal.collectedKopecks, monthlyGoal.goalKopecks)}
            />
            <p className={styles.metricNote}>
              {percentOf(monthlyGoal.collectedKopecks, monthlyGoal.goalKopecks).toLocaleString("ru-RU")}% из{" "}
              {formatKopecks(monthlyGoal.goalKopecks)} · {formatPlainDate(monthlyGoal.periodStart)} —{" "}
              {formatPlainDate(monthlyGoal.periodEnd)}
            </p>
          </>
        ) : (
          <p className={styles.metricNote}>
            Цель месяца не задана — на сайте видна только общая шкала, а она на старте показывает доли процента.{" "}
            {can("goals") ? <Link href="/admin/goals">Задать цель месяца</Link> : null}
          </p>
        )}
      </div>
    </div>
  );
}

function PeriodTotals({ data }: { readonly data: Dashboard }) {
  const { period } = data;

  return (
    <dl className={styles.totals}>
      <div>
        <dt>Сумма за период</dt>
        <dd>{formatKopecks(period.totalKopecks)}</dd>
      </div>
      <div>
        <dt>Поступлений</dt>
        <dd>{formatCount(period.count)}</dd>
      </div>
      <div>
        <dt>Средний чек</dt>
        <dd>{period.count === 0 ? "—" : formatKopecks(period.averageKopecks)}</dd>
      </div>
    </dl>
  );
}

/** Дашборд (API.md §15): сбор, цель месяца, итоги и разрезы за период. */
export function DashboardOverview() {
  const [period, setPeriod] = useState<DashboardPeriod>({ preset: "30", from: "", to: "" });
  // Пресеты считаются от «сейчас»: фиксируем момент открытия экрана, чтобы
  // путь запроса не менялся на каждом рендере и не перезапрашивал данные.
  const [presetAnchor] = useState(() => Date.now());
  const anchored = resolvePeriod(period, presetAnchor);
  const path = anchored.ok ? withQuery(ADMIN_PATHS.dashboard, anchored.period.params) : null;
  const { data, error, isLoading, reload } = useAdminQuery<Dashboard>(path);

  return (
    <>
      <Section title="Сбор">
        {data ? <CampaignProgress data={data} /> : null}
        {isLoading && data === null ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
      </Section>

      <Section title="Поступления за период">
        <div className={styles.presets} role="group" aria-label="Период">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              isSmall
              variant={period.preset === preset.value ? "primary" : "ghost"}
              aria-pressed={period.preset === preset.value}
              onClick={() => setPeriod((current) => ({ ...current, preset: preset.value }))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {period.preset === "custom" ? (
          <div className={styles.customPeriod}>
            <TextField
              label="С"
              type="date"
              value={period.from}
              onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))}
            />
            <TextField
              label="По (включительно)"
              type="date"
              value={period.to}
              onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
              error={anchored.ok ? null : anchored.error}
              hint="Не длиннее 366 дней, даты — по Уфе"
            />
          </div>
        ) : null}

        {data && anchored.ok ? (
          <>
            <PeriodTotals data={data} />
            <DayChart days={fillDays(data.byDay, anchored.period.fromDay, anchored.period.toDay)} />
          </>
        ) : null}
      </Section>

      {data ? (
        <>
          <Section title="По источникам (UTM)">
            {data.byUtm.length === 0 ? (
              <EmptyState title="За период поступлений нет." />
            ) : (
              <DataTable
                caption="По источникам"
                columns={UTM_COLUMNS}
                rows={data.byUtm}
                rowKey={(row) => `${row.source}|${row.medium}|${row.campaign}`}
              />
            )}
          </Section>
          <Section title="По способам оплаты">
            {data.byMethod.length === 0 ? (
              <EmptyState title="За период поступлений нет." />
            ) : (
              <DataTable
                caption="По способам оплаты"
                columns={METHOD_COLUMNS}
                rows={data.byMethod}
                rowKey={(row) => row.method ?? "none"}
              />
            )}
          </Section>
          <Section
            title="Последние поступления"
            actions={<Link href="/admin/donations">Все пожертвования →</Link>}
          >
            {data.recent.length === 0 ? (
              <EmptyState title="Оплаченных поступлений пока нет." />
            ) : (
              <DataTable caption="Последние поступления" columns={RECENT_COLUMNS} rows={data.recent} rowKey={(row) => row.id} />
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
