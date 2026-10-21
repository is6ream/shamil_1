"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ChevronDownIcon, KeyIcon, LogoutIcon } from "@/components/admin/ui/AdminIcons";
import type { AdminUser } from "@/lib/admin/endpoints";
import { ADMIN_ACCOUNT } from "@/lib/admin/navigation";
import { ROLE_LABELS } from "@/lib/admin/roles";

import styles from "./ProfileMenu.module.css";

interface Props {
  readonly user: AdminUser;
  readonly isLoggingOut: boolean;
  readonly onLogout: () => void;
}

export function displayNameOf(user: AdminUser): string {
  return user.displayName ?? user.email;
}

/** Первая буква имени — кружок-аватар. */
function initialOf(user: AdminUser): string {
  return displayNameOf(user).trim().charAt(0).toUpperCase() || "?";
}

/**
 * Меню профиля в шапке: кто вошёл, смена пароля, выход.
 * Disclosure, а не ARIA-menu: внутри обычные ссылка и кнопка, Tab по ним
 * работает как везде. Закрывается по Esc, клику мимо и переходу.
 */
export function ProfileMenu({ user, isLoggingOut, onLogout }: Props) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointer(event: PointerEvent) {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`Профиль: ${displayNameOf(user)}`}
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initialOf(user)}
        </span>
        <span className={styles.who} aria-hidden="true">
          <span className={styles.name}>{displayNameOf(user)}</span>
          <span className={styles.role}>{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDownIcon className={styles.chevron} />
      </button>

      <div id={panelId} className={styles.panel} hidden={!isOpen}>
        <div className={styles.head}>
          <p className={styles.headName}>{displayNameOf(user)}</p>
          <p className={styles.headMeta}>
            {user.email} · {ROLE_LABELS[user.role]}
          </p>
        </div>
        <Link href={ADMIN_ACCOUNT} className={styles.item}>
          <KeyIcon className={styles.itemIcon} />
          Сменить пароль
        </Link>
        <button type="button" className={`${styles.item} ${styles.danger}`} disabled={isLoggingOut} onClick={onLogout}>
          <LogoutIcon className={styles.itemIcon} />
          {isLoggingOut ? "Выходим…" : "Выйти"}
        </button>
      </div>
    </div>
  );
}
