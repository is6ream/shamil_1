"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { METRIKA_CONFIG } from "@/lib/analytics/config";
import { isTrackedPath } from "@/lib/analytics/tracked-paths";
import { COOKIE_CONSENT, PAGES, SECTION_IDS } from "@/lib/content";
import { useSectionVisible } from "@/lib/hooks/useSectionVisible";

import styles from "./CookieConsent.module.css";
import { decideConsent, useConsent } from "./useConsent";

/**
 * Баннер согласия на cookie Яндекс Метрики.
 *
 * Не модальный: не перехватывает фокус и не мешает пожертвовать. Пока форма
 * доната на экране телефона, баннер спрятан — форма обязана помещаться
 * в экран целиком. На десктопе форма в правой колонке, баннер — слева внизу.
 *
 * Нет счётчика или согласие не требуется — баннера нет вовсе.
 */
export function CookieConsent() {
  const consent = useConsent();
  const isFormVisible = useSectionVisible(SECTION_IDS.donate);
  const pathname = usePathname();

  if (!isTrackedPath(pathname) || METRIKA_CONFIG.counterId === null || !METRIKA_CONFIG.requireConsent || consent !== "unknown") {
    return null;
  }

  return (
    <section
      className={styles.banner}
      aria-label={COOKIE_CONSENT.label}
      data-form-visible={isFormVisible ? "true" : "false"}
    >
      <p className={styles.text}>
        {COOKIE_CONSENT.text}{" "}
        <Link href={PAGES.cookie.href}>{COOKIE_CONSENT.more}</Link>
      </p>
      <div className={styles.actions}>
        <button className="btn btn-primary" type="button" onClick={() => decideConsent("granted")}>
          {COOKIE_CONSENT.accept}
        </button>
        <button className={`btn btn-ghost ${styles.decline}`} type="button" onClick={() => decideConsent("denied")}>
          {COOKIE_CONSENT.decline}
        </button>
      </div>
    </section>
  );
}
