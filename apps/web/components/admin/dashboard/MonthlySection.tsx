"use client";

import { useState } from "react";

import { Section } from "@/components/admin/ui/Blocks";
import { Segmented } from "@/components/admin/ui/Segmented";
import { ErrorState, SkeletonRows } from "@/components/admin/ui/StateViews";
import { groupByMonth, MONTH_WINDOWS, monthLabel, resolveMonths } from "@/lib/admin/dashboard";
import type { MonthsWindow } from "@/lib/admin/dashboard";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import type { Dashboard } from "@/lib/admin/types";

import { BarChart } from "./BarChart";

/**
 * Поступления по месяцам. Отдельного эндпоинта нет: тот же дашборд за
 * 3/6/12 месяцев, дни складываются в месяцы на клиенте.
 */
export function MonthlySection({ now }: { readonly now: number }) {
  const [months, setMonths] = useState<MonthsWindow>(6);
  const period = resolveMonths(months, now);
  const { data, error, isLoading, reload } = useAdminQuery<Dashboard>(withQuery(ADMIN_PATHS.dashboard, period.params));

  return (
    <Section title="По месяцам" description="Текущий месяц — по сегодняшний день.">
      <Segmented
        label="Сколько месяцев показать"
        options={MONTH_WINDOWS.map((value) => ({ value, label: `${value} мес.` }))}
        value={months}
        onChange={setMonths}
      />
      {data ? (
        <BarChart
          bars={groupByMonth(data.byDay, period.fromDay, period.toDay)}
          title={(bar) => monthLabel(bar.date)}
          axisLabel={(bar) => monthLabel(bar.date, "short")}
          isEveryLabel
          hint="Наведите на столбик или коснитесь его, чтобы увидеть сумму за месяц"
          tableSummary="Таблица по месяцам"
          unitHeader="Месяц"
        />
      ) : null}
      {isLoading && data === null ? <SkeletonRows rows={3} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
    </Section>
  );
}
