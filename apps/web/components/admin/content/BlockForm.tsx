"use client";

import type { FormEvent, ReactNode } from "react";

import { FormActions } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors } from "@/components/admin/ui/Field";
import { ReorderButtons } from "@/components/admin/ui/ReorderButtons";

import styles from "./content.module.css";

interface BlockFormProps {
  readonly isPending: boolean;
  readonly isDirty: boolean;
  readonly serverErrors: readonly string[];
  readonly hasErrors: boolean;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}

/** Общая рамка формы блока: поля, ошибки сервера, «Сохранить». */
export function BlockForm({ isPending, isDirty, serverErrors, hasErrors, onSubmit, children }: BlockFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {children}
      {hasErrors ? <FormErrors messages={["Проверьте поля, отмеченные красным."]} /> : null}
      <FormErrors messages={serverErrors} />
      <FormActions>
        <Button type="submit" isBusy={isPending} disabled={!isDirty}>
          Сохранить
        </Button>
        {isDirty ? <span className={styles.dirty}>Есть несохранённые изменения</span> : null}
      </FormActions>
    </form>
  );
}

interface ListItemProps {
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly onMove: (index: number, delta: number) => void;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}

/** Строка списка (пункт доверия, факт, вопрос): поля + порядок + удалить. */
export function ListItem({ label, index, count, onMove, onRemove, children }: ListItemProps) {
  return (
    <li className={styles.listItem}>
      <div className={styles.listFields}>{children}</div>
      <div className={styles.listActions}>
        <ReorderButtons label={label} index={index} count={count} onMove={onMove} />
        <Button variant="ghost" isSmall aria-label={`Удалить: ${label}`} onClick={onRemove}>
          Удалить
        </Button>
      </div>
    </li>
  );
}
