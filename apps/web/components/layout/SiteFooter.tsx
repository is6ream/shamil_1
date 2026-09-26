import Link from "next/link";

import { FOOTER, PAGES, SECTION_IDS } from "@/lib/content";
import { ORGANIZATION, organizationDisplayName, toTelHref } from "@/lib/organization";

import { BrandMark } from "./BrandMark";
import styles from "./SiteFooter.module.css";

const INFO_LINKS = [PAGES.privacy, PAGES.cookie, PAGES.reports] as const;

/** На телефоне в макете только две ссылки из трёх. */
const MOBILE_HIDDEN_HREF: string = PAGES.cookie.href;

/**
 * Футер макета v2: логотип и юрлицо, контакты, информация.
 *
 * Неизвестные значения (телефон, адрес, Telegram) — `null` в
 * lib/organization.ts с TODO(заказчик): строка с `null` не выводится,
 * плейсхолдеры макета в квадратных скобках на сайт не попадают.
 */
export function SiteFooter() {
  const { phone, mosqueAddress, imamName, telegramChannel } = ORGANIZATION;

  return (
    <footer className={styles.footer} id={SECTION_IDS.contacts}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <div className={styles.brand}>
            <BrandMark size="lg" />
            <p className={styles.legal}>
              {organizationDisplayName()} · ИНН {ORGANIZATION.inn}
            </p>
          </div>

          <div>
            <p className={styles.eyebrow}>{FOOTER.contacts}</p>
            {phone === null ? null : (
              <a className={styles.phone} href={toTelHref(phone)}>
                {phone}
              </a>
            )}
            <ul className={styles.lines}>
              <li>{mosqueAddress === null ? "г. Уфа" : `г. Уфа, ${mosqueAddress}`}</li>
              <li>
                {FOOTER.imamPrefix} {imamName}
              </li>
              {telegramChannel === null ? null : (
                <li>
                  {FOOTER.telegramPrefix}{" "}
                  <a href={`https://t.me/${telegramChannel}`} target="_blank" rel="noopener noreferrer">
                    @{telegramChannel}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className={styles.info}>
            <p className={styles.eyebrow}>{FOOTER.info}</p>
            <ul className={styles.links}>
              {INFO_LINKS.map((link) => (
                <li
                  key={link.href}
                  className={link.href === MOBILE_HIDDEN_HREF ? styles.desktopOnly : undefined}
                >
                  <Link href={link.href}>{link.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className={styles.copyright}>{FOOTER.copyright}</p>
      </div>
    </footer>
  );
}
