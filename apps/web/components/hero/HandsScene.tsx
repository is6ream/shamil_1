import type { CSSProperties } from "react";

/**
 * Сцена первого экрана: ладони поднимаются → падает монета 100 ₽ → из света
 * линией прорисовывается мечеть → полумесяц. Около пяти секунд, один проход.
 *
 * Пять секунд объясняют слоган без единого слова. Чистый SVG + CSS, вся
 * анимация — в scene.css; ни GSAP, ни Lottie. `prefers-reduced-motion`
 * показывает финальный кадр (там же).
 *
 * Тот же компонент стоит на странице «спасибо»: раньше разметка была
 * скопирована в оба места, и правка тайминга расходилась между ними.
 */

/**
 * Длина контура для прорисовки линией: `scene.css` подставляет её
 * в `stroke-dasharray` и `stroke-dashoffset`. Пользовательские свойства
 * не входят в тип `CSSProperties`, поэтому приведение здесь неизбежно —
 * оно спрятано в одну функцию, а не рассыпано по разметке.
 */
function pathLength(length: number): CSSProperties {
  return { "--len": length } as CSSProperties;
}

interface Props {
  /** Подпись под сценой. На телефоне скрыта силами scene.css. */
  readonly caption?: string;
}

export function HandsScene({ caption }: Props) {
  return (
    <div className="stage">
      <div className="pattern" />
      <div className="glow" />
      <svg className="art" viewBox="0 0 400 400" aria-hidden="true">
        <g className="coin">
          <circle className="stroke" cx="200" cy="150" r="26" />
          <text x="200" y="156" textAnchor="middle">
            100 ₽
          </text>
        </g>

        <g className="mosque">
          <path
            className="stroke"
            style={pathLength(340)}
            d="M150 268 v-52 a50 50 0 0 1 100 0 v52"
          />
          <path className="stroke fillfade" d="M186 268 v-34 a14 14 0 0 1 28 0 v34" />
          <path className="stroke" style={pathLength(150)} d="M128 268 v-46" />
          <path className="stroke" style={pathLength(150)} d="M272 268 v-46" />
          <path className="stroke fillfade" d="M128 222 l0 -10 M272 222 l0 -10" />
          <circle className="stroke fillfade" cx="128" cy="208" r="5" />
          <circle className="stroke fillfade" cx="272" cy="208" r="5" />
          <path className="stroke" style={pathLength(160)} d="M140 268 h120" />
          <g className="crescent">
            <path className="stroke" d="M200 152 a15 15 0 1 0 11 25 a12 12 0 1 1 -11 -25" />
          </g>
        </g>

        <g className="hands">
          <path
            className="stroke"
            d="M96 272 c0 -26 14 -42 38 -46 c18 -3 40 -2 66 -2 c26 0 48 -1 66 2
               c24 4 38 20 38 46 c0 34 -46 62 -104 62 c-58 0 -104 -28 -104 -62 z"
          />
          <path
            className="stroke"
            d="M96 272 c-16 -6 -28 -20 -30 -38 c-1 -10 6 -16 13 -12 c9 5 15 16 17 28"
          />
          <path
            className="stroke"
            d="M304 272 c16 -6 28 -20 30 -38 c1 -10 -6 -16 -13 -12 c-9 5 -15 16 -17 28"
          />
          <path
            className="stroke"
            d="M138 300 c22 10 50 14 62 14 c12 0 40 -4 62 -14"
            opacity=".5"
          />
        </g>

        <circle className="stroke spark" cx="150" cy="200" r="2.5" />
        <circle className="stroke spark" cx="255" cy="185" r="2" />
        <circle className="stroke spark" cx="205" cy="120" r="2.5" />
      </svg>

      {caption === undefined ? null : <div className="caption">{caption}</div>}
    </div>
  );
}
