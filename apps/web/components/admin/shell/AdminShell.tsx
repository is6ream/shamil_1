"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { ExternalIcon } from "@/components/admin/ui/AdminIcons";
import type { AdminUser } from "@/lib/admin/endpoints";
import { ADMIN_HOME, findSection, menuGroups, mobileTabs } from "@/lib/admin/navigation";
import { useAdminSession } from "@/lib/admin/session";
import { useSidebarCollapsed } from "@/lib/admin/use-sidebar-collapsed";

import { MobileTabBar } from "./MobileTabBar";
import { ProfileMenu } from "./ProfileMenu";
import styles from "./Shell.module.css";
import { Sidebar } from "./Sidebar";

interface Props {
  readonly user: AdminUser;
  readonly children: ReactNode;
}

/**
 * Каркас кабинета.
 * Телефон (< 768): шапка с логотипом и профилем, нижняя панель разделов.
 * С 768: сайдбар слева (на планшете — только иконки), шапка над контентом.
 */
export function AdminShell({ user, children }: Props) {
  const pathname = usePathname();
  const { can, logout } = useAdminSession();
  const [isCollapsed, toggleCollapsed] = useSidebarCollapsed();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const current = findSection(pathname);
  const groups = menuGroups(can);

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
  }

  return (
    <div className={styles.shell} data-collapsed={isCollapsed}>
      <a href="#admin-main" className={styles.skipLink}>
        Перейти к содержимому
      </a>

      <Sidebar groups={groups} current={current} isCollapsed={isCollapsed} onToggleCollapsed={toggleCollapsed} />

      <header className={styles.topbar}>
        <Link href={ADMIN_HOME} className={styles.topBrand} aria-label="Мечеть «Шамиль» — обзор">
          <Image className={styles.logo} src="/brand/logo.svg" alt="" width={32} height={32} unoptimized />
          <span>Мечеть «Шамиль»</span>
        </Link>
        <div className={styles.topActions}>
          <a href="/" target="_blank" rel="noopener noreferrer" className={styles.siteLink}>
            <ExternalIcon />
            Открыть сайт
          </a>
          <ProfileMenu user={user} isLoggingOut={isLoggingOut} onLogout={handleLogout} />
        </div>
      </header>

      <main id="admin-main" className={styles.main} tabIndex={-1}>
        {children}
      </main>

      <MobileTabBar
        tabs={mobileTabs(can)}
        groups={groups}
        current={current}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      />
    </div>
  );
}
