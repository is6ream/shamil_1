"use client";

import { useState } from "react";

import { Section } from "@/components/admin/ui/Blocks";
import { DataTable } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { TextField } from "@/components/admin/ui/Field";
import { Segmented } from "@/components/admin/ui/Segmented";
import { EmptyState, SkeletonRows } from "@/components/admin/ui/StateViews";
import { Tabs } from "@/components/admin/ui/Tabs";
import type { TabItem } from "@/components/admin/ui/Tabs";
import { fillDays } from "@/lib/admin/dashboard";
import type { DashboardPeriod, PeriodCheck, PeriodPreset } from "@/lib/admin/dashboard";
import { methodLabel } from "@/lib/admin/labels";
import { formatKopecks } from "@/lib/admin/money";
import { formatPlainDate } from "@/lib/admin/time";
import type { Dashboard } from "@/lib/admin/types";
import { formatCount } from "@/lib/format";

import { BarChart } from "./BarChart";
import styles from "./dashboard.module.css";

type UtmRow = Dashboard["byUtm"][number];
type MethodRow = Dashboard["byMethod"][number];
type View = "days" | "utm" | "method";

const PRESETS: readonly { readonly value: PeriodPreset; readonly label: string }[] = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" },
  { value: "custom", label: "Свой период" },
];

const VIEWS: readonly TabItem<View>[] = [
  { value: "days", label: "По дням" },
  { value: "utm", label: "Источники" },
  { value: "method", label: "Способы оплаты" },
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

interface Props {
  readonly period: DashboardPeriod;
  readonly onPeriodChange: (update: (current: DashboardPeriod) => DashboardPeriod) => void;
  readonly anchored: PeriodCheck;
  readonly data: Dashboard | null;
}

function PeriodTotals({ period }: { readonly period: Dashboard["period"] }) {
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

function Breakdown({ view, data, anchored }: { readonly view: View; readonly data: Dashboard; readonly anchored: PeriodCheck }) {
  if (view === "days") {
    return anchored.ok ? (
      <BarChart
        bars={fillDays(data.byDay, anchored.period.fromDay, anchored.period.toDay)}
        title={(bar) => formatPlainDate(bar.date)}
        axisLabel={(bar) => formatPlainDate(bar.date).slice(0, 5)}
        hint="Наведите на столбик, чтобы увидеть сумму за день"
        tableSummary="Таблица по дням"
        unitHeader="День"
      />
    ) : null;
  }

  const rows = view === "utm" ? data.byUtm : data.byMethod;

  if (rows.length === 0) {
    return <EmptyState title="За период поступлений нет." />;
  }

  return view === "utm" ? (
    <DataTable
      caption="Поступления по источникам"
      columns={UTM_COLUMNS}
      rows={data.byUtm}
      rowKey={(row) => `${row.source}|${row.medium}|${row.campaign}`}
    />
  ) : (
    <DataTable
      caption="Поступления по способам оплаты"
      columns={METHOD_COLUMNS}
      rows={data.byMethod}
      rowKey={(row) => row.method ?? "none"}
    />
  );
}

/** Итоги за выбранный период и его разрезы: дни, UTM-источники, способы оплаты. */
export function PeriodSection({ period, onPeriodChange, anchored, data }: Props) {
  const [view, setView] = useState<View>("days");

  return (
    <Section title="За период" description="По дате оплаты, время — по Уфе.">
      <Segmented
        label="Период"
        options={PRESETS}
        value={period.preset}
        onChange={(preset) => onPeriodChange((current) => ({ ...current, preset }))}
      />
      {period.preset === "custom" ? (
        <div className={styles.customPeriod}>
          <TextField
            label="С"
            type="date"
            value={period.from}
            onChange={(event) => onPeriodChange((current) => ({ ...current, from: event.target.value }))}
          />
          <TextField
            label="По (включительно)"
            type="date"
            value={period.to}
            onChange={(event) => onPeriodChange((current) => ({ ...current, to: event.target.value }))}
            error={anchored.ok ? null : anchored.error}
            hint="Не длиннее 366 дней, даты — по Уфе"
          />
        </div>
      ) : null}

      {data && anchored.ok ? (
        <>
          <PeriodTotals period={data.period} />
          <Tabs label="Разрез поступлений" items={VIEWS} value={view} onChange={setView}>
            <Breakdown view={view} data={data} anchored={anchored} />
          </Tabs>
        </>
      ) : null}
      {data === null && anchored.ok ? <SkeletonRows rows={3} /> : null}
    </Section>
  );
}
