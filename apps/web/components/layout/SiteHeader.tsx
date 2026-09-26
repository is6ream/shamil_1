"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { MenuIcon } from "@/components/icons/Icons";
import { HERO, NAV_ITEMS, SECTION_IDS } from "@/lib/content";
import { useActiveSection } from "@/lib/hooks/useActiveSection";
import { ORGANIZATION, toTelHref } from "@/lib/organization";
import { scrollToSection, sectionHref } from "@/lib/scroll-to-section";

import { BrandMark } from "./BrandMark";
import { MobileMenu } from "./MobileMenu";
import styles from "./SiteHeader.module.css";

const MENU_ID = "mobile-menu";
const NAV_IDS = NAV_ITEMS.map((item) => item.id);

/**
 * Шапка макета v2: логотип, навигация по секциям, телефон, «Помочь».
 *
 * Работает и на главной, и на служебных страницах: ссылки ведут на `/#id`,
 * а на главной клик перехватывается плавной прокруткой (см.
 * `scrollToSection` — там же, почему не просто `#id`).
 *
 * На телефоне и планшете навигация уезжает в выдвижное меню.
 */
export function SiteHeader() {
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
    <header className={styles.header}>
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
              {item.label}
            </a>
          ))}
        </nav>

        {ORGANIZATION.phone === null ? null : (
          <a className={styles.phone} href={toTelHref(ORGANIZATION.phone)}>
            {ORGANIZATION.phone}
          </a>
        )}

        <a
          className={`btn btn-primary ${styles.help}`}
          href={sectionHref(SECTION_IDS.donate)}
          onClick={(event) => {
            onNavigate(event, SECTION_IDS.donate);
          }}
        >
          {HERO.helpButton}
        </a>

        <button
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
        </button>
      </div>

      <MobileMenu id={MENU_ID} isOpen={isMenuOpen} onClose={closeMenu} onNavigate={onNavigate} />
    </header>
  );
}
