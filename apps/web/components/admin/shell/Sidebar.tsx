"use client";

import Image from "next/image";
import Link from "next/link";

import { ExternalIcon, SidebarIcon } from "@/components/admin/ui/AdminIcons";
import { ADMIN_HOME } from "@/lib/admin/navigation";
import type { AdminSection, MenuGroup } from "@/lib/admin/navigation";

import { NavItem } from "./NavItem";
import styles from "./Shell.module.css";

interface Props {
  readonly groups: readonly MenuGroup[];
  readonly current: AdminSection | undefined;
  readonly isCollapsed: boolean;
  readonly onToggleCollapsed: () => void;
}

/** Левая колонка с 768 px: логотип, разделы по группам, «Открыть сайт», свернуть. */
export function Sidebar({ groups, current, isCollapsed, onToggleCollapsed }: Props) {
  return (
    <aside className={styles.sidebar}>
      <Link href={ADMIN_HOME} className={styles.brand} title="Мечеть «Шамиль» — кабинет">
        <Image className={styles.logo} src="/brand/logo.svg" alt="" width={36} height={36} unoptimized />
        <span className={styles.brandText}>
          <span className={styles.brandName}>Мечеть «Шамиль»</span>
          <span className={styles.brandSub}>Личный кабинет</span>
        </span>
      </Link>

      <nav className={styles.sideNav} aria-label="Разделы кабинета">
        {groups.map((group) => (
          <div key={group.title ?? "main"} className={styles.navGroup}>
            {group.title ? <p className={styles.groupTitle}>{group.title}</p> : null}
            <ul>
              {group.sections.map((section) => (
                <li key={section.href}>
                  <NavItem section={section} isCurrent={current?.href === section.href} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.sideFooter}>
        <a href="/" target="_blank" rel="noopener noreferrer" className={styles.navLink} title="Открыть сайт в новой вкладке">
          <ExternalIcon className={styles.navIcon} />
          <span className={styles.navLabel}>Открыть сайт</span>
        </a>
        <button
          type="button"
          className={`${styles.navLink} ${styles.collapseToggle}`}
          aria-pressed={isCollapsed}
          title={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
          onClick={onToggleCollapsed}
        >
          <SidebarIcon className={styles.navIcon} />
          <span className={styles.navLabel}>{isCollapsed ? "Развернуть меню" : "Свернуть меню"}</span>
        </button>
      </div>
    </aside>
  );
}
