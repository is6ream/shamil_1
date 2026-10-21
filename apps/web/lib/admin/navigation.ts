import type { AdminPermission } from "./roles";

/** Иконка раздела — ключ из `SECTION_ICONS` (components/admin/ui/AdminIcons). */
export type SectionIconKey =
  | "home"
  | "donations"
  | "goals"
  | "stages"
  | "news"
  | "content"
  | "media"
  | "gallery"
  | "video"
  | "users"
  | "audit"
  | "account";

/** Группа меню. `profile` — не в меню, а в меню профиля в шапке. */
export type SectionGroup = "main" | "collection" | "site" | "media" | "manage" | "profile";

/**
 * Разделы админки. `permission` — кто видит пункт (D-06), `isReady` —
 * экран уже сделан. Неготовые разделы открывают заглушку «ждёт сервер»:
 * так заказчик видит всю структуру, а не 404.
 *
 * Адреса не меняются при перестановке меню: на них есть закладки.
 */
export interface AdminSection {
  readonly href: string;
  readonly label: string;
  /** Подпись во вкладке нижней панели телефона — до ~11 символов. */
  readonly shortLabel: string;
  readonly icon: SectionIconKey;
  readonly group: SectionGroup;
  readonly permission: AdminPermission | null;
  readonly isReady: boolean;
}

export const ADMIN_HOME = "/admin";
export const ADMIN_LOGIN = "/admin/login";
export const ADMIN_ACCOUNT = "/admin/account";

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: ADMIN_HOME, label: "Обзор", shortLabel: "Обзор", icon: "home", group: "main", permission: null, isReady: true },
  {
    href: "/admin/donations",
    label: "Пожертвования",
    shortLabel: "Поступления",
    icon: "donations",
    group: "collection",
    permission: "donations",
    isReady: true,
  },
  {
    href: "/admin/goals",
    label: "Цели сбора",
    shortLabel: "Цели",
    icon: "goals",
    group: "collection",
    permission: "campaign",
    isReady: true,
  },
  {
    href: "/admin/stages",
    label: "Ход стройки",
    shortLabel: "Стройка",
    icon: "stages",
    group: "site",
    permission: "content",
    isReady: true,
  },
  { href: "/admin/news", label: "Новости", shortLabel: "Новости", icon: "news", group: "site", permission: "content", isReady: true },
  {
    href: "/admin/content",
    label: "Тексты сайта",
    shortLabel: "Тексты",
    icon: "content",
    group: "site",
    permission: "content",
    isReady: true,
  },
  {
    href: "/admin/media",
    label: "Медиатека",
    shortLabel: "Медиатека",
    icon: "media",
    group: "media",
    permission: "content",
    isReady: true,
  },
  {
    href: "/admin/gallery",
    label: "Галерея на сайте",
    shortLabel: "Галерея",
    icon: "gallery",
    group: "media",
    permission: "content",
    isReady: true,
  },
  { href: "/admin/video", label: "Видео", shortLabel: "Видео", icon: "video", group: "media", permission: "content", isReady: true },
  {
    href: "/admin/users",
    label: "Пользователи",
    shortLabel: "Люди",
    icon: "users",
    group: "manage",
    permission: "users",
    isReady: true,
  },
  {
    href: "/admin/audit",
    label: "Журнал действий",
    shortLabel: "Журнал",
    icon: "audit",
    group: "manage",
    permission: "audit",
    isReady: true,
  },
  {
    href: ADMIN_ACCOUNT,
    label: "Сменить пароль",
    shortLabel: "Пароль",
    icon: "account",
    group: "profile",
    permission: null,
    isReady: true,
  },
];

const GROUP_TITLES: readonly { readonly group: Exclude<SectionGroup, "profile">; readonly title: string | null }[] = [
  { group: "main", title: null },
  { group: "collection", title: "Сбор" },
  { group: "site", title: "Сайт" },
  { group: "media", title: "Медиа" },
  { group: "manage", title: "Управление" },
];

/**
 * Вкладки нижней панели телефона: первые четыре доступных по этому
 * порядку. Остальное — во вкладке «Ещё». Редактору нужнее стройка и фото,
 * бухгалтеру — цели и журнал; порядок сам раскладывает это по ролям.
 */
const MOBILE_TAB_PRIORITY: readonly string[] = [
  ADMIN_HOME,
  "/admin/donations",
  "/admin/stages",
  "/admin/media",
  "/admin/goals",
  "/admin/audit",
];

export const MOBILE_TAB_COUNT = 4;

type CanCheck = (permission: AdminPermission) => boolean;

export interface MenuGroup {
  readonly title: string | null;
  readonly sections: readonly AdminSection[];
}

export function visibleSections(can: CanCheck): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => section.permission === null || can(section.permission));
}

/** Меню сайдбара: группы по порядку, без пустых и без раздела профиля. */
export function menuGroups(can: CanCheck): MenuGroup[] {
  const visible = visibleSections(can);

  return GROUP_TITLES.map(({ group, title }) => ({
    title,
    sections: visible.filter((section) => section.group === group),
  })).filter((group) => group.sections.length > 0);
}

export function mobileTabs(can: CanCheck): AdminSection[] {
  const visible = visibleSections(can);

  return MOBILE_TAB_PRIORITY.map((href) => visible.find((section) => section.href === href))
    .filter((section): section is AdminSection => section !== undefined)
    .slice(0, MOBILE_TAB_COUNT);
}

/** Раздел по пути: точное совпадение или вложенная страница раздела. */
export function findSection(pathname: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find(
    (section) =>
      pathname === section.href || (section.href !== ADMIN_HOME && pathname.startsWith(`${section.href}/`)),
  );
}

export function sectionBySlug(slug: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => section.href === `${ADMIN_HOME}/${slug}`);
}
