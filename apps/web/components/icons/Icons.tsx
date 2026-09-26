import type { ReactNode, SVGProps } from "react";

/**
 * Линейные иконки макета v2. Инлайн-SVG, без icon-пакетов.
 *
 * Все иконки в одном файле намеренно: каждая — несколько строк разметки
 * без логики, и 9 файлов по 10 строк читаются хуже одного. Цвет — от
 * `currentColor`, размер — от CSS родителя (по умолчанию 1em).
 *
 * Иконки декоративные (`aria-hidden`): смысл несёт подпись или
 * `aria-label` кнопки, внутри которой иконка лежит.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Svg({ children, ...rest }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Щит с галочкой — пункты доверия первого экрана. */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.9 7 9.3 4.1-1.4 7-5 7-9.3V5.8L12 3Z" />
      <path d="m9 12 2.1 2.1L15.2 10" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </Svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function CheckMarkIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth="2.4">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Svg>
  );
}

/**
 * Восьмиконечная звезда (два наложенных квадрата) с кругом — орнамент
 * полосы с хадисом и плейсхолдера рендера.
 */
export function StarOrnamentIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth="1.2">
      <rect x="5.5" y="5.5" width="13" height="13" />
      <rect x="5.5" y="5.5" width="13" height="13" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}
