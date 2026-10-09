"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import { TextField } from "./Field";
import styles from "./Modal.module.css";

interface ModalProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Модальное окно на нативном `<dialog>`: ловушка фокуса, Esc и возврат
 * фокуса на кнопку-открывашку браузер делает сам.
 */
export function Modal({ isOpen, title, onClose, children }: ModalProps) {
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
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {isOpen ? children : null}
    </dialog>
  );
}

interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly isDanger?: boolean;
  readonly isBusy?: boolean;
  /**
   * Для самых опасных действий: подтверждение только после ввода этой
   * строки (например, повтор суммы ручного поступления).
   */
  readonly typedConfirmation?: { readonly label: string; readonly expected: string };
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Нормализация повтора: пробелы разрядов и запятая не должны мешать. */
function normalizeTyped(value: string): string {
  return value.replace(/[\s₽]/g, "").replace(",", ".");
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Modal isOpen={props.isOpen} title={props.title} onClose={props.onCancel}>
      <ConfirmBody {...props} />
    </Modal>
  );
}

/** Тело живёт, только пока окно открыто: введённый повтор сбрасывается сам. */
function ConfirmBody({
  description,
  confirmLabel,
  isDanger = false,
  isBusy = false,
  typedConfirmation,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const isConfirmed =
    typedConfirmation === undefined ||
    normalizeTyped(typed) === normalizeTyped(typedConfirmation.expected);

  return (
    <>
      <div className={styles.body}>{description}</div>
      {typedConfirmation ? (
        <TextField
          label={typedConfirmation.label}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
        />
      ) : null}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={isBusy}>
          Отмена
        </Button>
        <Button
          variant={isDanger ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={!isConfirmed}
          isBusy={isBusy}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );
}
