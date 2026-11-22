import { useId } from "react";

import styles from "./ConstructionTimeline.module.css";

const SITE = "M21 553 228 424H1115L1181 552 1064 579H21Z";

const LITER_EAVE_LIGHTS = [[40, 61], [103, 63], [166, 65], [230, 67], [437, 91], [480, 105]] as const;
const LITER_WALL_LIGHTS = [[557, 210], [650, 207], [745, 204], [839, 200]] as const;

const TREES = [
  [203, 534, .70], [253, 551, .73], [306, 549, .58],
  [616, 552, .59], [668, 554, .77], [739, 543, .61],
  [790, 526, .68], [839, 527, .61], [1054, 546, .65], [1118, 537, .76],
] as const;

const LAMPS = [[335, 557], [561, 554], [712, 566], [855, 555], [967, 535], [1145, 552]] as const;

export function ConstructionScene({ landscaped }: { readonly landscaped: boolean }) {
  const id = useId();
  const paint = (name: string) => "url(#" + id + "-" + name + ")";

  return (
    <svg className={styles.scene} viewBox="0 0 1200 600" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + "-ground"} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#203748" />
          <stop offset="1" stopColor="#334b58" />
        </linearGradient>
        <linearGradient id={id + "-grass"} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#587258" />
          <stop offset="1" stopColor="#2c473c" />
        </linearGradient>
        <linearGradient id={id + "-foliage"} x1="0" y1="0" x2="1" y2=".75">
          <stop stopColor="#95a777" />
          <stop offset=".48" stopColor="#587b55" />
          <stop offset="1" stopColor="#253f3c" />
        </linearGradient>
        <radialGradient id={id + "-glow"}>
          <stop stopColor="#fff0b5" stopOpacity=".85" />
          <stop offset=".4" stopColor="#ffbd6b" stopOpacity=".44" />
          <stop offset="1" stopColor="#f3a456" stopOpacity="0" />
        </radialGradient>
        <pattern id={id + "-paving"} width="19" height="9" patternUnits="userSpaceOnUse" patternTransform="skewX(-23)">
          <path d="M0 0H19M0 4.5H19M4 0V4.5M13 4.5V9" fill="none" stroke="#273e47" strokeOpacity=".35" />
        </pattern>
      </defs>

      <g>
        <path d="M21 553H1181V562L1064 590H21Z" fill="#132530" />
        <path d={SITE} fill={paint("ground")} stroke="#668496" strokeOpacity=".7" strokeWidth="1.5" />
        <path d="M24 579H1064L1180 552" fill="none" stroke="#7c97a4" strokeOpacity=".42" />
      </g>

      <g className={styles.sceneLayer} data-visible={landscaped}>
        <g stroke="#687e69" strokeWidth="1.3" fill={paint("grass")}>
          <path d="M33 553 236 432H453L318 546 290 568H33Z" />
          <path d="M549 548 616 466H801L743 526 748 548 672 567H577Z" />
          <path d="M942 543 971 511 1110 473 1167 546 1055 571H982Z" />
        </g>
        <g fill="none" stroke="#a0967c" strokeWidth="30" strokeLinejoin="round">
          <path d="M468 522 461 552 449 578M461 552 729 550 864 546 889 481" />
          <path d="M461 552 295 539 119 541" strokeWidth="17" />
          <path d="M864 546 975 556 1077 553 1165 534" strokeWidth="15" />
        </g>
        <g fill="none" stroke={paint("paving")} strokeWidth="29" strokeLinejoin="round">
          <path d="M468 522 461 552 449 578M461 552 729 550 864 546 889 481" />
          <path d="M461 552 295 539 119 541" strokeWidth="16" />
          <path d="M864 546 975 556 1077 553 1165 534" strokeWidth="14" />
        </g>
        <path d="M432 578H466L461 584H427Z" fill="#96917c" />
      </g>

      {/* The approved mosque artwork fixes the silhouette, scale and single minaret. */}
      <image
        href="/landing/mosque-model.webp"
        x="-108" y="15" width="960" height="540"
      />

      <g>
        <path d="M721 476 871 467 1157 497 1164 511 981 527 886 496Z" fill="#142630" opacity=".72" />
        <svg x="719" y="402" width="444" height="113" viewBox="0 0 900 229">
          <defs>
            <clipPath id={id + "-liter-facade"}>
              <path d="M7 54 275 63V38L404 33V70L518 96 894 89 885 204 520 218 400 160 280 155 7 132Z" />
            </clipPath>
          </defs>
          <image href="/landing/liter-building.webp" width="900" height="229" />
          <g clipPath={paint("liter-facade")}>
            <path d="M0 0H900V229H0Z" fill="#fbb869" opacity=".13" />
            <g fill={paint("glow")} opacity=".9">
              {LITER_EAVE_LIGHTS.map(([x, y]) => (
                <ellipse key={x} cx={x} cy={y + 12} rx="35" ry="44" />
              ))}
              {LITER_WALL_LIGHTS.map(([x, y]) => (
                <ellipse key={x} cx={x} cy={y - 14} rx="44" ry="62" />
              ))}
              <ellipse cx="340" cy="112" rx="50" ry="64" />
              <ellipse cx="290" cy="148" rx="22" ry="43" />
              <ellipse cx="388" cy="152" rx="23" ry="44" />
            </g>
            <g fill="#fff0b5">
              {LITER_EAVE_LIGHTS.map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="3.5" ry="2" />)}
              {LITER_WALL_LIGHTS.map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="5" ry="2" />)}
            </g>
          </g>
        </svg>
      </g>

      <g className={styles.sceneLayer} data-visible={landscaped}>
        {TREES.map(([x, y, scale]) => (
          <g key={x} transform={"translate(" + x + " " + y + ") scale(" + scale + ")"}>
            <ellipse cx="7" cy="2" rx="22" ry="5" fill="#142c32" opacity=".7" />
            <path d="M-2 3V-23H2V3Z" fill="#7b7055" />
            <path d="M0-50C-7-44-10-38-10-33-17-29-18-23-15-19-19-14-13-7-6-8-2-3 8-4 10-10 18-12 17-20 14-23 16-29 11-34 9-36 8-43 4-47 0-50Z" fill={paint("foliage")} />
            <path d="M-2-41C-9-32-12-21-10-14M2-33Q6-26 7-21" fill="none" stroke="#a0ac7c" strokeOpacity=".38" strokeWidth="2" />
          </g>
        ))}
        {LAMPS.map(([x, y]) => (
          <g key={x} transform={"translate(" + x + " " + y + ")"}>
            <ellipse rx="21" ry="7" fill={paint("glow")} />
            <ellipse cy="-25" rx="16" ry="17" fill={paint("glow")} />
            <path d="M0 2V-24M-5-24H5" fill="none" stroke="#283837" strokeWidth="2.5" />
            <path d="M-4-23H4" fill="none" stroke="#fde2a9" strokeWidth="2.3" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}
