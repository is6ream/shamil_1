"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ArrowRightIcon } from "@/components/icons/Icons";
import { REVEAL_SECTION_EVENT } from "@/lib/scroll-to-section";

import styles from "./MobileAccordion.module.css";

interface Props {
  /** Якорь секции: на него ведут шапка и меню. */
  readonly id: string;
  /** Строка аккордеона на телефоне. */
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Секция, которая на телефоне (< 768px) сворачивается в строку аккордеона,
 * а на планшете и десктопе — обычная секция без переключателя (макет v2).
 *
 * Содержимое рендерится на сервере и всегда лежит в DOM — поисковик его
 * видит; скрывает его только CSS и только на телефоне. Поэтому не `hidden`
 * и не `<details>`: те прятали бы секцию и на десктопе.
 *
 * Переход из меню раскрывает секцию: `scrollToSection` шлёт событие
 * `reveal-section` на корень.
 */
export function MobileAccordion({ id, title, className, children }: Props) {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const panelId = useId();

  useEffect(() => {
    const root = rootRef.current;

    if (root === null) {
      return;
    }

    const reveal = () => {
      setOpen(true);
    };

    root.addEventListener(REVEAL_SECTION_EVENT, reveal);

    return () => {
      root.removeEventListener(REVEAL_SECTION_EVENT, reveal);
    };
  }, []);

  return (
    <section className={`${styles.item} ${className ?? ""}`} id={id} ref={rootRef}>
      <h2 className={styles.heading}>
        <button
          className={styles.trigger}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          {title}
          <span className={styles.arrow} aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </button>
      </h2>

      <div className={styles.panel} id={panelId} data-open={isOpen ? "true" : "false"}>
        {children}
      </div>
    </section>
  );
}
