"use client";

import { useState } from "react";

import { barRatios } from "@/lib/admin/dashboard";
import type { DayBar } from "@/lib/admin/dashboard";
import { formatKopecks } from "@/lib/admin/money";
import { formatPlainDate } from "@/lib/admin/time";
import { pluralize } from "@/lib/format";

import styles from "./dashboard.module.css";

const HEIGHT = 160;
const GAP = 2;
const RADIUS = 4;

function caption(day: DayBar): string {
  return `${formatPlainDate(day.date)}: ${formatKopecks(day.totalKopecks)} · ${pluralize(day.count, [
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
 * Поступления по дням — столбики SVG. Один ряд — один цвет и без легенды;
 * подсказка по наведению и фокусу, зона попадания — во всю высоту дня.
 * Те же числа — в раскрывающейся таблице (клавиатура, скринридер).
 */
export function DayChart({ days }: { readonly days: readonly DayBar[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ratios = barRatios(days);
  const slot = 1000 / Math.max(days.length, 1);
  const barWidth = Math.max(slot - GAP, 1);
  const shown = active === null ? null : days[active];
  const labelEvery = Math.ceil(days.length / 6);

  return (
    <figure className={styles.chart}>
      <p className={styles.chartCaption} aria-live="polite">
        {shown ? caption(shown) : "Наведите на столбик, чтобы увидеть сумму за день"}
      </p>
      <svg
        viewBox={`0 0 1000 ${HEIGHT}`}
        preserveAspectRatio="none"
        className={styles.chartSvg}
        aria-hidden="true"
        onMouseLeave={() => setActive(null)}
      >
        <line x1="0" x2="1000" y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} className={styles.baseline} />
        {days.map((day, index) => {
          const height = ratios[index] * (HEIGHT - 8);
          const x = index * slot + GAP / 2;

          return (
            <g key={day.date} onMouseEnter={() => setActive(index)}>
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
        {days.map((day, index) =>
          (index % labelEvery === 0 && days.length - 1 - index >= labelEvery / 2) || index === days.length - 1 ? (
            <span key={day.date} style={{ left: `${((index + 0.5) / days.length) * 100}%` }}>
              {formatPlainDate(day.date).slice(0, 5)}
            </span>
          ) : null,
        )}
      </div>
      <details className={styles.dayTable}>
        <summary>Таблица по дням</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">День</th>
              <th scope="col">Сумма</th>
              <th scope="col">Поступлений</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{formatPlainDate(day.date)}</td>
                <td>{formatKopecks(day.totalKopecks)}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
