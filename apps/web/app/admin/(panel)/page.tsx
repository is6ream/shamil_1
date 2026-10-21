"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { DashboardOverview } from "@/components/admin/dashboard/DashboardOverview";
import { BuildIcon, DonationIcon, ImageIcon, NewsIcon, TargetIcon } from "@/components/admin/ui/AdminIcons";
import type { IconProps } from "@/components/icons/Icons";
import type { AdminPermission } from "@/lib/admin/roles";
import { useAdminSession } from "@/lib/admin/session";

import styles from "./home.module.css";

interface QuickAction {
  readonly href: string;
  readonly label: string;
  readonly Icon: ComponentType<IconProps>;
  readonly permission: AdminPermission;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { href: "/admin/donations", label: "Пожертвования", Icon: DonationIcon, permission: "donations" },
  { href: "/admin/stages", label: "Ход стройки", Icon: BuildIcon, permission: "content" },
  { href: "/admin/news/new", label: "Новость", Icon: NewsIcon, permission: "content" },
  { href: "/admin/media", label: "Загрузить фото", Icon: ImageIcon, permission: "content" },
  { href: "/admin/goals", label: "Цель месяца", Icon: TargetIcon, permission: "goals" },
];

/**
 * «Обзор»: дашборд сбора (все роли, API.md §15) и быстрые действия по роли.
 * Плиток всех разделов больше нет — меню теперь всегда на виду.
 */
export default function AdminHomePage() {
  const { state, can } = useAdminSession();
  const name = state.status === "authenticated" ? (state.user.displayName ?? state.user.email) : "";
  const actions = QUICK_ACTIONS.filter((action) => can(action.permission));

  return (
    <AdminPage title={`Здравствуйте, ${name}`} lead="Как идёт сбор и что можно сделать.">
      {actions.length > 0 ? (
        <nav aria-label="Быстрые действия" className={styles.quick}>
          {actions.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={styles.quickLink}>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      <DashboardOverview />
    </AdminPage>
  );
}
