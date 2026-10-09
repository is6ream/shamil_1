import type { AdminPermission } from "./roles";

/**
 * Разделы админки. `permission` — кто видит пункт (D-06), `isReady` —
 * экран уже сделан. Неготовые разделы открывают заглушку «ждёт сервер»:
 * так заказчик видит всю структуру, а не 404.
 */
export interface AdminSection {
  readonly href: string;
  readonly label: string;
  readonly permission: AdminPermission | null;
  readonly isReady: boolean;
}

export const ADMIN_HOME = "/admin";
export const ADMIN_LOGIN = "/admin/login";

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: ADMIN_HOME, label: "Главная", permission: null, isReady: true },
  { href: "/admin/donations", label: "Пожертвования", permission: "donations", isReady: true },
  { href: "/admin/stages", label: "Ход стройки", permission: "content", isReady: false },
  { href: "/admin/content", label: "Тексты сайта", permission: "content", isReady: false },
  { href: "/admin/news", label: "Новости", permission: "content", isReady: false },
  { href: "/admin/media", label: "Фото", permission: "content", isReady: true },
  { href: "/admin/gallery", label: "Галерея", permission: "content", isReady: false },
  { href: "/admin/video", label: "Видео", permission: "content", isReady: false },
  { href: "/admin/goals", label: "Цели сбора", permission: "campaign", isReady: true },
  { href: "/admin/users", label: "Пользователи", permission: "users", isReady: false },
  { href: "/admin/audit", label: "Журнал действий", permission: "audit", isReady: false },
  { href: "/admin/account", label: "Сменить пароль", permission: null, isReady: true },
];

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
