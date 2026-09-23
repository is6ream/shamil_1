import type { CSSProperties } from "react";

import { clampPercent } from "@/lib/money";

interface Props {
  /** Процент как есть — обрезка по 100 происходит здесь, у ширины. */
  readonly percent: number;
  /** Что именно измеряет шкала: читается скринридером. */
  readonly label: string;
  readonly isThin?: boolean;
  readonly className?: string;
}

/**
 * Шкала прогресса.
 *
 * Заливка двигается `transform`, а не `width`: ширина каждый кадр гоняет
 * layout, трансформация уезжает на композитор (см. `.track` в kit.css).
 * Процент приходит посчитанным, здесь он только обрезается по краям —
 * перевыполнение остаётся числом в подписи, но за дорожку не вылезает.
 *
 * `aria-valuenow` округлён: диктовать «пять целых три десятых процента»
 * незачем, а вот «5 процентов» — полезно.
 */
export function ProgressTrack({ percent, label, isThin = false, className }: Props) {
  const width = clampPercent(percent);

  return (
    <div
      className={`track${isThin ? " thin" : ""}${className === undefined ? "" : ` ${className}`}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ "--p": `${width}%` } as CSSProperties}
    >
      <i className="fill" />
    </div>
  );
}
