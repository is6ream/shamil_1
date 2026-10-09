"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { ADMIN_SECTIONS, findSection } from "@/lib/admin/navigation";
import type { AdminUser } from "@/lib/admin/endpoints";
import { ROLE_LABELS } from "@/lib/admin/roles";
import { useAdminSession } from "@/lib/admin/session";

import styles from "./AdminShell.module.css";
import { Button } from "./ui/Button";

interface Props {
  readonly user: AdminUser;
  readonly children: ReactNode;
}

/** Каркас: шапка с пользователем и выходом, меню по ролям, контент. */
export function AdminShell({ user, children }: Props) {
  const pathname = usePathname();
  const { can, logout } = useAdminSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Меню на телефоне закрывается при переходе: запоминаем, на какой странице его открыли.
  const [menuPath, setMenuPath] = useState(pathname);
  const current = findSection(pathname);

  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setIsMenuOpen(false);
  }

  const visible = ADMIN_SECTIONS.filter(
    (section) => section.permission === null || can(section.permission),
  );

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.brand}>
          Мечеть «Шамиль» · админка
        </Link>
        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={isMenuOpen}
          aria-controls="admin-nav"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          {isMenuOpen ? "Закрыть" : "Меню"}
        </button>
        <div className={styles.user}>
          <span className={styles.userName}>{user.displayName ?? user.email}</span>
          <span className={styles.role}>{ROLE_LABELS[user.role]}</span>
        </div>
      </header>

      <nav
        id="admin-nav"
        className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ""}`}
        aria-label="Разделы админки"
      >
        <ul>
          {visible.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className={styles.navLink}
                aria-current={current?.href === section.href ? "page" : undefined}
              >
                {section.label}
                {section.isReady ? null : <span className={styles.soon}>скоро</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.navFooter}>
          <a href="/" target="_blank" rel="noreferrer" className={styles.navLink}>
            Открыть сайт ↗
          </a>
          <Button variant="ghost" isSmall isBusy={isLoggingOut} onClick={handleLogout}>
            Выйти
          </Button>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
