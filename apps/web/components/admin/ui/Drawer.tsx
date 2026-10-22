"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import { CloseIcon } from "@/components/icons/Icons";

import styles from "./Drawer.module.css";

interface DrawerProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly onClose: () => void;
  /** Ссылки рядом с заголовком: «Открыть отдельной страницей». */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Боковая панель поверх списка: справа на десктопе, листом снизу на телефоне.
 * Нативный `<dialog>`, как Modal: ловушку фокуса, Esc и возврат фокуса
 * на строку списка делает браузер. Закрывается и кликом по затемнению —
 * это просмотр, а не форма, которую жалко потерять.
 */
export function Drawer({ isOpen, title, onClose, actions, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;

    if (dialog === null) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby={titleId}
      onClose={(event) => {
        // onClose вложенного окна (подтверждение перевода) всплывает и сюда.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onClick={(event) => {
        // У `::backdrop` нет своего узла: клик по затемнению приходит в сам <dialog>,
        // а содержимое лежит во внутреннем блоке во всю высоту.
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={() => ref.current?.close()}>
            <CloseIcon />
          </button>
        </header>
        <div className={styles.body}>{isOpen ? children : null}</div>
      </div>
    </dialog>
  );
}
