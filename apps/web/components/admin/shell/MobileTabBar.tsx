"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CloseIcon } from "@/components/icons/Icons";
import { ExternalIcon, KeyIcon, LogoutIcon, MoreIcon } from "@/components/admin/ui/AdminIcons";
import { ADMIN_ACCOUNT } from "@/lib/admin/navigation";
import type { AdminSection, MenuGroup } from "@/lib/admin/navigation";

import { NavItem } from "./NavItem";
import styles from "./Shell.module.css";

interface Props {
  readonly tabs: readonly AdminSection[];
  readonly groups: readonly MenuGroup[];
  readonly current: AdminSection | undefined;
  readonly isLoggingOut: boolean;
  readonly onLogout: () => void;
}

/**
 * Нижняя панель телефона: четыре главных раздела роли и «Ещё».
 * До частых дел — одно касание, без раскрытия меню (решение этапа 0).
 * «Ещё» — лист снизу на нативном `<dialog>`: фокус-ловушку и Esc даёт браузер.
 */
export function MobileTabBar({ tabs, groups, current, isLoggingOut, onLogout }: Props) {
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isMoreCurrent = current !== undefined && !tabs.some((tab) => tab.href === current.href);

  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setIsSheetOpen(false);
  }

  useEffect(() => {
    const sheet = sheetRef.current;

    if (sheet === null) {
      return;
    }

    if (isSheetOpen && !sheet.open) {
      sheet.showModal();
    } else if (!isSheetOpen && sheet.open) {
      sheet.close();
    }
  }, [isSheetOpen]);

  return (
    <>
      <nav className={styles.tabbar} aria-label="Основные разделы">
        <ul>
          {tabs.map((tab) => (
            <li key={tab.href}>
              <NavItem section={tab} isCurrent={current?.href === tab.href} isShort className={styles.tab} />
            </li>
          ))}
          <li>
            <button
              type="button"
              className={styles.tab}
              aria-haspopup="dialog"
              aria-expanded={isSheetOpen}
              aria-current={isMoreCurrent ? "page" : undefined}
              onClick={() => setIsSheetOpen(true)}
            >
              <MoreIcon className={styles.navIcon} />
              <span className={styles.navLabel}>Ещё</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheetRef}
        className={styles.sheet}
        aria-labelledby={titleId}
        onClose={() => setIsSheetOpen(false)}
        onClick={(event) => {
          // Клик по затемнению (у `::backdrop` нет своего узла, целью будет сам
          // `<dialog>`) или по ссылке — в том числе на текущую страницу, где
          // смена адреса лист не закроет.
          const isLink = event.target instanceof Element && event.target.closest("a") !== null;

          if (event.target === event.currentTarget || isLink) {
            setIsSheetOpen(false);
          }
        }}
      >
        <div className={styles.sheetBody}>
          <div className={styles.sheetHead}>
            <h2 id={titleId} className={styles.sheetTitle}>
              Все разделы
            </h2>
            <button
              type="button"
              className={styles.sheetClose}
              aria-label="Закрыть"
              onClick={() => setIsSheetOpen(false)}
            >
              <CloseIcon />
            </button>
          </div>

          {groups.map((group) => (
            <div key={group.title ?? "main"} className={styles.sheetGroup}>
              {group.title ? <p className={styles.sheetGroupTitle}>{group.title}</p> : null}
              <ul>
                {group.sections.map((section) => (
                  <li key={section.href}>
                    <NavItem section={section} isCurrent={current?.href === section.href} className={styles.sheetLink} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className={styles.sheetGroup}>
            <p className={styles.sheetGroupTitle}>Профиль</p>
            <ul>
              <li>
                <a href="/" target="_blank" rel="noopener noreferrer" className={styles.sheetLink}>
                  <ExternalIcon className={styles.navIcon} />
                  <span>Открыть сайт</span>
                </a>
              </li>
              <li>
                <Link
                  href={ADMIN_ACCOUNT}
                  className={styles.sheetLink}
                  aria-current={pathname === ADMIN_ACCOUNT ? "page" : undefined}
                >
                  <KeyIcon className={styles.navIcon} />
                  <span>Сменить пароль</span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className={`${styles.sheetLink} ${styles.sheetDanger}`}
                  disabled={isLoggingOut}
                  onClick={onLogout}
                >
                  <LogoutIcon className={styles.navIcon} />
                  <span>{isLoggingOut ? "Выходим…" : "Выйти"}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
