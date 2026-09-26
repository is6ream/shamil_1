"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { CloseIcon } from "@/components/icons/Icons";
import { NAV_ITEMS } from "@/lib/content";
import { ORGANIZATION, toTelHref } from "@/lib/organization";

import styles from "./MobileMenu.module.css";

interface Props {
  readonly id: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Выезжающее меню телефона.
 *
 * Модальное по поведению: фокус заперт внутри, Esc и клик по фону
 * закрывают, прокрутка страницы под ним заблокирована. После закрытия
 * фокус возвращается на гамбургер — это делает шапка.
 *
 * В DOM всегда (скрыто через `hidden`), чтобы ссылки были доступны
 * поисковику и не было вспышки при первом открытии.
 */
export function MobileMenu({ id, isOpen, onClose, onNavigate }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || panel === null) {
        return;
      }

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (first === undefined || last === undefined) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return (
    <div className={styles.root} hidden={!isOpen}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.panel}
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Меню"
      >
        <button className={styles.close} type="button" onClick={onClose} aria-label="Закрыть меню">
          <CloseIcon />
        </button>

        <nav aria-label="Разделы сайта">
          <ul className={styles.list}>
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  className={styles.link}
                  href={`/#${item.id}`}
                  onClick={(event) => {
                    onNavigate(event, item.id);
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {ORGANIZATION.phone === null ? null : (
          <a className={styles.phone} href={toTelHref(ORGANIZATION.phone)}>
            {ORGANIZATION.phone}
          </a>
        )}
      </div>
    </div>
  );
}
