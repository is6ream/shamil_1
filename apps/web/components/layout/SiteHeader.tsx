"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { MenuIcon, UserIcon } from "@/components/icons/Icons";
import { HERO, NAV_ITEMS, SECTION_IDS } from "@/lib/content";
import { DONOR_CABINET_ENABLED, PROFILE_PATHS } from "@/lib/donor/endpoints";
import { hasDonorHint } from "@/lib/donor/hint";
import { useActiveSection } from "@/lib/hooks/useActiveSection";
import { ORGANIZATION, toTelHref } from "@/lib/organization";
import { scrollToSection, sectionHref } from "@/lib/scroll-to-section";

import { BrandMark } from "./BrandMark";
import { MobileMenu } from "./MobileMenu";
import styles from "./SiteHeader.module.css";

const MENU_ID = "mobile-menu";
const NAV_IDS = NAV_ITEMS.map((item) => item.id);

/**
 * Окно входа и admin-клиент не нужны жертвователям: чанк грузится только
 * после первого клика по иконке (D-F11) и в первый бандл главной не входит.
 */
const LoginDialog = dynamic(
  () => import("@/components/auth/LoginDialog").then((module) => module.LoginDialog),
  { ssr: false },
);

/** Окно кабинета жертвователя — тоже лениво, по первому клику. */
const DonorLoginDialog = dynamic(
  () => import("@/components/donor/DonorLoginDialog").then((module) => module.DonorLoginDialog),
  { ssr: false },
);

const LOGIN_LABEL = DONOR_CABINET_ENABLED ? "Личный кабинет" : "Вход для сотрудников";

/** Метка входа в кабинет: на сервере её нет, в браузере читается из localStorage. */
function subscribeStorage(listener: () => void): () => void {
  window.addEventListener("storage", listener);

  return () => window.removeEventListener("storage", listener);
}

function useDonorHint(): boolean {
  return useSyncExternalStore(subscribeStorage, () => DONOR_CABINET_ENABLED && hasDonorHint(), () => false);
}

/**
 * Иконка входа. При включённом кабинете — «Личный кабинет» жертвователя
 * (вход для сотрудников — ссылкой внутри окна), иначе — только для сотрудников.
 * Если в этом браузере уже входили, иконка сразу ведёт в кабинет.
 *
 * В шапке их две — на десктопе и на телефоне стоят в разных местах,
 * а переставлять одну через CSS `order` нельзя: порядок Tab разошёлся бы
 * с видимым. Скрытая через `display: none` из Tab выпадает.
 */
function LoginButton({ className, onOpen }: { readonly className: string; readonly onOpen: () => void }) {
  const isSignedIn = useDonorHint();

  if (isSignedIn) {
    return (
      <Link className={`${styles.login} ${className}`} href={PROFILE_PATHS.home} aria-label={LOGIN_LABEL}>
        <UserIcon />
      </Link>
    );
  }

  return (
    <button
      className={`${styles.login} ${className}`}
      type="button"
      aria-label={LOGIN_LABEL}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <UserIcon />
    </button>
  );
}

/**
 * Шапка макета v2: логотип, навигация по секциям, телефон, «Помочь».
 *
 * Работает и на главной, и на служебных страницах: ссылки ведут на `/#id`,
 * а на главной клик перехватывается плавной прокруткой (см.
 * `scrollToSection` — там же, почему не просто `#id`).
 *
 * На телефоне и планшете навигация уезжает в выдвижное меню.
 */
interface Props {
  /** Телефон и текст кнопки из админки; по умолчанию — хардкод. */
  readonly phone?: string | null;
  readonly helpButton?: string;
}

export function SiteHeader({ phone = ORGANIZATION.phone, helpButton = HERO.helpButton }: Props = {}) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isLoginOpen, setLoginOpen] = useState(false);
  // Окно смонтировано с первого открытия: так чанк не грузится заранее,
  // а повторные открытия мгновенные.
  const [hasLoginOpened, setLoginOpened] = useState(false);
  const [isDonorOpen, setDonorOpen] = useState(false);
  const [hasDonorOpened, setDonorOpened] = useState(false);
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const activeId = useActiveSection(NAV_IDS);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  const openStaffLogin = useCallback(() => {
    setLoginOpened(true);
    setLoginOpen(true);
  }, []);

  const openLogin = useCallback(() => {
    if (!DONOR_CABINET_ENABLED) {
      openStaffLogin();
      return;
    }

    setDonorOpened(true);
    setDonorOpen(true);
  }, [openStaffLogin]);

  const closeDonor = useCallback(() => {
    setDonorOpen(false);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
  }, []);

  /**
   * Вход из выдвижного меню (узкие экраны). Фокус сначала на бургер:
   * `<dialog>` вернёт его туда, где он был при открытии, а пункт меню
   * к тому моменту уже скрыт.
   */
  const openLoginFromMenu = useCallback(() => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
    openLogin();
  }, [openLogin]);

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

        {phone === null ? null : (
          <a className={styles.phone} href={toTelHref(phone)}>
            {phone}
          </a>
        )}

        <LoginButton className={styles.loginDesktop} onOpen={openLogin} />

        <a
          className={`btn btn-primary ${styles.help}`}
          href={sectionHref(SECTION_IDS.donate)}
          onClick={(event) => {
            onNavigate(event, SECTION_IDS.donate);
          }}
        >
          {helpButton}
        </a>

        <LoginButton className={styles.loginMobile} onOpen={openLogin} />

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

      <MobileMenu
        id={MENU_ID}
        isOpen={isMenuOpen}
        onClose={closeMenu}
        onNavigate={onNavigate}
        onLoginOpen={openLoginFromMenu}
        phone={phone}
      />

      {hasLoginOpened ? <LoginDialog isOpen={isLoginOpen} onClose={closeLogin} /> : null}
      {hasDonorOpened ? (
        <DonorLoginDialog
          isOpen={isDonorOpen}
          onClose={closeDonor}
          returnTo={PROFILE_PATHS.home}
          onSignedIn={() => {
            setDonorOpen(false);
            router.push(PROFILE_PATHS.home);
          }}
          onStaffLogin={() => {
            setDonorOpen(false);
            openStaffLogin();
          }}
        />
      ) : null}
    </header>
  );
}
