import { useId } from "react";

import styles from "./GirihPattern.module.css";

/** Вершины восьмиконечной звезды в тайле 60×60: общие для узора и разделителя. */
export const GIRIH_STAR_POINTS =
  "50,30 44.14,35.86 44.14,44.14 35.86,44.14 30,50 24.14,44.14 15.86,44.14 15.86,35.86 10,30 15.86,24.14 15.86,15.86 24.14,15.86 30,10 35.86,15.86 44.14,15.86 44.14,24.14";

const TILE = 60;

type GirihPatternProps = {
  /** Непрозрачность всего узора. */
  opacity?: number;
};

/**
 * Фоновый гирих: тайл 60×60 на всю площадь родителя, к центру гаснет
 * под радиальной CSS-маской, чтобы не спорить с текстом. Где начинается
 * затухание — `--girih-fade-start` у родителя (по умолчанию 28%).
 *
 * Родитель должен быть `position: relative; overflow: hidden`.
 * Цвет линий — `color` (по умолчанию --girih-line), рисуется через currentColor.
 * id генерируются useId(): два узора на одной странице не делят тайл.
 */
export function GirihPattern({ opacity = 0.35 }: GirihPatternProps) {
  const uid = useId();
  const patternId = `${uid}-girih-tile`;

  return (
    <svg className={styles.root} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={patternId} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <polygon points={GIRIH_STAR_POINTS} />
            <path d="M50 30H60M0 30H10M30 0V10M30 50V60" />
            <path d="M0 6L6 0M54 0L60 6M60 54L54 60M6 60L0 54" />
          </g>
          <rect
            x="26"
            y="26"
            width="8"
            height="8"
            transform="rotate(45 30 30)"
            fill="currentColor"
            opacity="0.6"
          />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill={`url(#${patternId})`}
        opacity={opacity}
      />
    </svg>
  );
}
