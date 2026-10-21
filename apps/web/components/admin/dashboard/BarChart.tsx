"use client";

import { useState } from "react";

import { barRatios } from "@/lib/admin/dashboard";
import type { DayBar } from "@/lib/admin/dashboard";
import { formatKopecks } from "@/lib/admin/money";
import { pluralize } from "@/lib/format";

import styles from "./dashboard.module.css";

const HEIGHT = 160;
const GAP = 2;
const RADIUS = 4;

interface BarChartProps {
  readonly bars: readonly DayBar[];
  /** Полная подпись столбика: «09.10.2026», «октябрь 2026». */
  readonly title: (bar: DayBar) => string;
  /** Короткая подпись на оси: «09.10», «окт». */
  readonly axisLabel: (bar: DayBar) => string;
  /** Подписать каждый столбик, а не ~6 штук: для месяцев их не больше 12. */
  readonly isEveryLabel?: boolean;
  readonly hint: string;
  readonly tableSummary: string;
  readonly unitHeader: string;
}

function caption(bar: DayBar, title: string): string {
  return `${title}: ${formatKopecks(bar.totalKopecks)} · ${pluralize(bar.count, [
    "поступление",
    "поступления",
    "поступлений",
  ])}`;
}

/** Путь столбика со скруглённым верхом и плоским основанием на нулевой линии. */
function barPath(x: number, width: number, height: number): string {
  const r = Math.min(RADIUS, width / 2, height);
  const top = HEIGHT - height;

  return `M${x},${HEIGHT} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${HEIGHT} Z`;
}

/**
 * Поступления столбиками SVG — по дням или по месяцам. Один ряд — один цвет
 * и без легенды; подсказка по наведению, зона попадания — во всю высоту.
 * Те же числа — в раскрывающейся таблице (клавиатура, скринридер).
 */
export function BarChart({ bars, title, axisLabel, isEveryLabel = false, hint, tableSummary, unitHeader }: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const ratios = barRatios(bars);
  const slot = 1000 / Math.max(bars.length, 1);
  const barWidth = Math.max(slot - (isEveryLabel ? slot * 0.3 : GAP), 1);
  const shown = active === null ? null : bars[active];
  const labelEvery = isEveryLabel ? 1 : Math.ceil(bars.length / 6);

  return (
    <figure className={styles.chart}>
      <p className={styles.chartCaption} aria-live="polite">
        {shown ? caption(shown, title(shown)) : hint}
      </p>
      <svg
        viewBox={`0 0 1000 ${HEIGHT}`}
        preserveAspectRatio="none"
        className={styles.chartSvg}
        aria-hidden="true"
        onMouseLeave={() => setActive(null)}
      >
        <line x1="0" x2="1000" y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className={styles.baseline} />
        {bars.map((bar, index) => {
          const height = ratios[index] * (HEIGHT - 8);
          const x = index * slot + (slot - barWidth) / 2;

          return (
            <g key={bar.date} onMouseEnter={() => setActive(index)}>
              <rect x={index * slot} y="0" width={slot} height={HEIGHT} className={styles.hit} />
              {height > 0 ? (
                <path
                  d={barPath(x, barWidth, Math.max(height, 2))}
                  className={`${styles.bar} ${active === index ? styles.barActive : ""}`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className={styles.axis} aria-hidden="true">
        {bars.map((bar, index) =>
          (index % labelEvery === 0 && bars.length - 1 - index >= labelEvery / 2) || index === bars.length - 1 ? (
            <span
              key={bar.date}
              className={isEveryLabel && index % 2 === 1 && bars.length > 6 ? styles.axisMinor : undefined}
              style={{ left: `${((index + 0.5) / bars.length) * 100}%` }}
            >
              {axisLabel(bar)}
            </span>
          ) : null,
        )}
      </div>
      <details className={styles.dayTable}>
        <summary>{tableSummary}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{unitHeader}</th>
              <th scope="col">Сумма</th>
              <th scope="col">Поступлений</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.date}>
                <td>{title(bar)}</td>
                <td>{formatKopecks(bar.totalKopecks)}</td>
                <td>{bar.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
