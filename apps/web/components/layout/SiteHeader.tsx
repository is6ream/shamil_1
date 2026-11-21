"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { LocationPin, MenuIcon, UserIcon } from "@/components/icons/Icons";
import { NAV_ITEMS } from "@/lib/content";
import { useActiveSection } from "@/lib/hooks/useActiveSection";
import { ORGANIZATION, toTelHref } from "@/lib/organization";
import { scrollToSection, sectionHref } from "@/lib/scroll-to-section";

import { BrandMark } from "./BrandMark";
import { MobileMenu } from "./MobileMenu";
import styles from "./SiteHeader.module.css";

const MENU_ID = "mobile-menu";
const NAV_IDS = NAV_ITEMS.map((item) => item.id);

/**
 * Вход жертвователя. Скрытая версия ссылки выпадает из Tab-порядка.
 */
function LoginButton({ className }: { readonly className: string }) {
  return (
    <Link
      className={`${styles.login} ${className}`}
      href="/donor"
      aria-label="Личный кабинет жертвователя"
      title="Личный кабинет жертвователя"
    >
      <UserIcon />
    </Link>
  );
}

/**
 * Шапка: логотип, навигация по секциям, телефон и вход.
 *
 * Работает и на главной, и на служебных страницах: ссылки ведут на `/#id`,
 * а на главной клик перехватывается плавной прокруткой (см.
 * `scrollToSection` — там же, почему не просто `#id`).
 *
 * На телефоне и планшете навигация уезжает в выдвижное меню.
 */
interface Props {
  /** Телефон из админки; по умолчанию — хардкод. */
  readonly phone?: string | null;
  readonly landing?: boolean;
}

export function SiteHeader({ phone = ORGANIZATION.phone, landing = false }: Props = {}) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const activeId = useActiveSection(NAV_IDS);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);
  const onNavigate = useCallback((event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    setMenuOpen(false);

    if (scrollToSection(id)) {
      event.preventDefault();
    }
  }, []);

  return (
    <header className={landing ? `${styles.header} ${styles.landing} on-dark` : styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label="Мечеть «Шамиль» — на главную">
          <BrandMark hasTagline />
        </Link>

        <nav className={styles.nav} aria-label="Разделы сайта">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              className={styles.navLink}
              href={sectionHref(item.id)}
              aria-current={activeId === item.id ? "location" : undefined}
              onClick={(event) => {
                onNavigate(event, item.id);
              }}
            >
              {landing && item.id === "route" ? <LocationPin /> : null}
              {item.label}
            </a>
          ))}
        </nav>

        {phone === null || landing ? null : (
          <a className={styles.phone} href={toTelHref(phone)}>
            {phone}
          </a>
        )}

        <LoginButton className={styles.loginDesktop} />

        {landing ? null : <LoginButton className={styles.loginMobile} />}

        {landing ? null : <button
          className={styles.burger}
          ref={menuButtonRef}
          type="button"
          aria-label="Открыть меню"
          aria-expanded={isMenuOpen}
          aria-controls={MENU_ID}
          onClick={() => {
            setMenuOpen(true);
          }}
        >
          <MenuIcon />
        </button>}
      </div>

      {landing ? null : <MobileMenu
        id={MENU_ID}
        isOpen={isMenuOpen}
        onClose={closeMenu}
        onNavigate={onNavigate}
        phone={phone}
      />}

    </header>
  );
}
