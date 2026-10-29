"use client";

import { useState } from "react";

import dashboard from "@/components/admin/dashboard/dashboard.module.css";
import { Note, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { DataTable } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { SelectField, TextField } from "@/components/admin/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { GROUPING_OPTIONS, MODEL_OPTIONS, sourceLabel, sourceRowKey, sourcesReportPath } from "@/lib/admin/attribution";
import { resolvePeriod } from "@/lib/admin/dashboard";
import type { DashboardPeriod, PeriodPreset } from "@/lib/admin/dashboard";
import { LIMITS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { formatKopecks } from "@/lib/admin/money";
import type { AttributionModel, DonationsBySource, SourceAggregate, SourceGrouping, SourceRow } from "@/lib/admin/types";
import { formatCount } from "@/lib/format";

const PRESETS: readonly { readonly value: PeriodPreset; readonly label: string }[] = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" },
  { value: "custom", label: "Свой период" },
];

const NO_VALUE = "—";

function aggregateColumns(): readonly Column<SourceAggregate>[] {
  return [
    { key: "count", header: "Пожертвований", isNumeric: true, render: (row) => formatCount(row.count) },
    { key: "total", header: "Сумма", isNumeric: true, render: (row) => formatKopecks(row.totalKopecks) },
    { key: "average", header: "Средний чек", isNumeric: true, render: (row) => formatKopecks(row.averageKopecks) },
  ];
}

function columnsFor(groupBy: SourceGrouping): readonly Column<SourceRow>[] {
  const source: Column<SourceRow> = {
    key: "source",
    header: groupBy === "how_did_you_hear" ? "Откуда узнали" : "Источник",
    render: (row) => sourceLabel(row.source, groupBy),
  };
  const campaign: Column<SourceRow> = { key: "campaign", header: "Кампания", render: (row) => row.campaign ?? NO_VALUE };
  const content: Column<SourceRow> = { key: "content", header: "Объявление", render: (row) => row.content ?? NO_VALUE };
  const dimensions =
    groupBy === "campaign" ? [source, campaign] : groupBy === "content" ? [source, campaign, content] : [source];

  return [...dimensions, ...aggregateColumns()];
}

function Totals({ data }: { readonly data: DonationsBySource }) {
  return (
    <dl className={dashboard.totals}>
      <div>
        <dt>Оплачено за период</dt>
        <dd>{formatKopecks(data.total.totalKopecks)}</dd>
      </div>
      <div>
        <dt>Пожертвований</dt>
        <dd>{formatCount(data.total.count)}</dd>
      </div>
      <div>
        <dt>Без атрибуции</dt>
        <dd>
          {formatCount(data.unattributed.count)} · {formatKopecks(data.unattributed.totalKopecks)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Отчёт «Пожертвования по источникам» (`GET /admin/analytics/donations-by-source`).
 * Только оплаченные донаты, по дате оплаты. Период — те же пресеты, что
 * на дашборде, и те же даты по Уфе.
 */
export function SourcesReport() {
  const [period, setPeriod] = useState<DashboardPeriod>({ preset: "30", from: "", to: "" });
  const [model, setModel] = useState<AttributionModel>("last");
  const [groupBy, setGroupBy] = useState<SourceGrouping>("source");
  // Пресеты считаются от момента открытия экрана: путь не меняется на каждом рендере.
  const [presetAnchor] = useState(() => Date.now());
  const anchored = resolvePeriod(period, presetAnchor);
  const path = anchored.ok ? sourcesReportPath(anchored.period.params, model, groupBy) : null;
  const { data, error, isLoading, reload } = useAdminQuery<DonationsBySource>(path);
  const modelHint = MODEL_OPTIONS.find((option) => option.value === model)?.hint;

  return (
    <>
      <Section title="Период и разрез">
        <div className={dashboard.presets} role="group" aria-label="Период">
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
          <div className={dashboard.customPeriod}>
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
              hint={`Не длиннее ${LIMITS.dashboardMaxDays} дней, даты — по Уфе`}
            />
          </div>
        ) : null}
        <div className={dashboard.customPeriod}>
          <SelectField
            label="Модель атрибуции"
            options={MODEL_OPTIONS}
            value={model}
            disabled={groupBy === "how_did_you_hear"}
            onChange={(event) => setModel(event.target.value as AttributionModel)}
            hint={groupBy === "how_did_you_hear" ? "Ответ из формы не зависит от модели." : modelHint}
          />
          <SelectField
            label="Разрез"
            options={GROUPING_OPTIONS}
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as SourceGrouping)}
          />
        </div>
      </Section>

      <Section title="Пожертвования по источникам">
        {isLoading && data === null ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {data ? (
          <>
            <Totals data={data} />
            {data.rows.length === 0 ? (
              <EmptyState title="За период нет оплаченных пожертвований с источником." />
            ) : (
              <DataTable
                caption="Пожертвования по источникам"
                columns={columnsFor(data.groupBy)}
                rows={data.rows}
                rowKey={sourceRowKey}
              />
            )}
          </>
        ) : null}
        <Note>
          <p>
            «Без атрибуции» — пожертвования, у которых нет данных о переходе: внесённые вручную, переводы по
            реквизитам без ответа «откуда узнали», браузеры с отключёнными cookie. Источник «Прямой заход» —
            человек открыл сайт сам, без ссылки.
          </p>
        </Note>
      </Section>
    </>
  );
}
