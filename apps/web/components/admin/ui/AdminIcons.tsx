import type { ComponentType } from "react";

import { Svg } from "@/components/icons/Icons";
import type { IconProps } from "@/components/icons/Icons";
import type { SectionIconKey } from "@/lib/admin/navigation";

/**
 * Линейные иконки админки — тем же пером, что иконки сайта (24×24,
 * штрих 1.7, `currentColor`). Декоративные: смысл несёт подпись рядом
 * или `aria-label` кнопки.
 *
 * `data-icon` и `data-part` — зацепки для микродвижения при наведении
 * на пункт меню или кнопку; сами правила — в admin-icons.css.
 */

export function HomeIcon(props: IconProps) {
  return (
    <Svg data-icon="home" {...props}>
      <path data-part="house" d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
      {/* Тот же дом, разрезанный по карнизу, — виден только во время движения.
          В покое рисуется цельный путь: разрезанный сглаживается в углах иначе.
          `opacity` атрибутом — чтобы копия была скрыта и без CSS движения. */}
      <g data-part="house-split" opacity={0}>
        <path data-part="roof" d="M4 10.5 12 4l8 6.5" />
        <path d="M20 10.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5" />
      </g>
    </Svg>
  );
}

/** Пожертвования: ладонь с монетой. */
export function DonationIcon(props: IconProps) {
  return (
    <Svg data-icon="donations" {...props}>
      <circle data-part="coin" cx="15" cy="7" r="3" />
      <path d="M3 14h3l3.5 1.3H13a1.6 1.6 0 0 1 0 3.2h-3" />
      <path d="m13 18.5 5.6-2.6a1.7 1.7 0 0 1 1.6 3l-6.4 3.1H8L6 21H3" />
    </Svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Svg data-icon="goals" {...props}>
      <circle data-part="ring-outer" cx="12" cy="12" r="8.5" />
      <circle data-part="ring-inner" cx="12" cy="12" r="4.5" />
      <circle data-part="bullseye" cx="12" cy="12" r="0.8" fill="currentColor" />
    </Svg>
  );
}

/** Ход стройки: здание с куполом. */
export function BuildIcon(props: IconProps) {
  return (
    <Svg data-icon="stages" {...props}>
      <path d="M3 20h18" />
      <path d="M5 20v-8h14v8" />
      <path data-part="dome" pathLength={1} d="M7.5 12a4.5 4.5 0 0 1 9 0" />
      <path data-part="spire" pathLength={1} d="M12 7.5V4" />
      <path d="M10 20v-4h4v4" />
    </Svg>
  );
}

export function NewsIcon(props: IconProps) {
  return (
    <Svg data-icon="news" {...props}>
      <g data-part="page">
        <path d="M5 4h11v15a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" />
        <path d="M7.5 8h5M7.5 11.5h5M7.5 15h3" />
      </g>
      <path d="M16 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
    </Svg>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <Svg data-icon="content" {...props}>
      <g data-part="glyph">
        <path d="M5 6V4.5h14V6" />
        <path d="M12 4.5v15" />
        <path d="M9 19.5h6" />
      </g>
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg data-icon="media" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle data-part="sun" cx="9" cy="10" r="1.6" />
      <path d="m4 17.5 5-4.5 4 3.5 2.5-2 4.5 3.5" />
    </Svg>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <Svg data-icon="gallery" {...props}>
      <rect data-part="tile-tl" x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect data-part="tile-tr" x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect data-part="tile-bl" x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect data-part="tile-br" x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <Svg data-icon="video" {...props}>
      <rect x="3" y="5.5" width="13" height="13" rx="2" />
      <path data-part="lens" d="m16 10.5 5-3v9l-5-3" />
    </Svg>
  );
}

/** Источники: развилка путей — откуда пришёл жертвователь. */
export function SourcesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 6h2a4 4 0 0 1 4 4v0a2 2 0 0 0 2 2M8 18h2a4 4 0 0 0 4-4v0a2 2 0 0 1 2-2" />
    </Svg>
  );
}

/** Короткие ссылки: звенья цепи. */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg data-icon="users" {...props}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <g data-part="second">
        <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
        <path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" />
      </g>
    </Svg>
  );
}

export function JournalIcon(props: IconProps) {
  return (
    <Svg data-icon="audit" {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3v2.5h6V3" />
      <path data-part="lines" pathLength={1} d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4" />
    </Svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Svg data-icon="key" {...props}>
      <g data-part="key">
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
      </g>
    </Svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Svg data-icon="logout" {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path data-part="arrow" d="M10 8 6 12l4 4M6 12h10" />
    </Svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Svg data-icon="external" {...props}>
      <path data-part="arrow" d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg data-icon="chevron-right" {...props}>
      <path data-part="chevron" d="m9.5 6 6 6-6 6" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg data-icon="chevron-down" {...props}>
      <path data-part="chevron" d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

/** Свернуть/развернуть сайдбар. */
export function SidebarIcon(props: IconProps) {
  return (
    <Svg data-icon="sidebar" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path data-part="divider" d="M9.5 4.5v15" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg data-icon="more" {...props}>
      <circle data-part="dot-1" cx="5.5" cy="12" r="1.3" fill="currentColor" />
      <circle data-part="dot-2" cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle data-part="dot-3" cx="18.5" cy="12" r="1.3" fill="currentColor" />
    </Svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Svg data-icon="inbox" {...props}>
      <path d="M3.5 13.5 6 5.5a1.5 1.5 0 0 1 1.4-1h9.2a1.5 1.5 0 0 1 1.4 1l2.5 8" />
      <path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.5 2.5h-4L8.5 13.5h-5Z" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg data-icon="alert" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.3" r="0.6" fill="currentColor" />
    </Svg>
  );
}

/** Иконки разделов по ключу — навигация описана данными, без JSX. */
export const SECTION_ICONS = {
  home: HomeIcon,
  donations: DonationIcon,
  goals: TargetIcon,
  stages: BuildIcon,
  news: NewsIcon,
  content: TextIcon,
  media: ImageIcon,
  gallery: GalleryIcon,
  video: VideoIcon,
  sources: SourcesIcon,
  shortLinks: LinkIcon,
  users: UsersIcon,
  audit: JournalIcon,
  account: KeyIcon,
} as const satisfies Readonly<Record<SectionIconKey, ComponentType<IconProps>>>;
