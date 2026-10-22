"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FieldGrid, FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextAreaField, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { GoalProgress } from "@/components/goal/GoalProgress";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import {
  GOAL_DESCRIPTION_MAX,
  GOAL_TITLE_MAX,
  changedGoalBody,
  checkGoalForm,
  initialGoalForm,
  previewGoal,
} from "@/lib/admin/fundraising-goals";
import type { GoalForm } from "@/lib/admin/fundraising-goals";
import { useAdminMutation } from "@/lib/admin/hooks";
import { formatKopecks } from "@/lib/admin/money";
import type { FundraisingGoalBody, FundraisingGoalRecord } from "@/lib/admin/types";

import styles from "./fundraising-goals.module.css";

interface SaveArgs {
  readonly id: string | null;
  readonly body: Partial<FundraisingGoalBody>;
}

function saveGoal(client: AdminClient, { id, body }: SaveArgs): Promise<FundraisingGoalRecord> {
  return id === null
    ? client.request<FundraisingGoalRecord>(ADMIN_PATHS.fundraisingGoals, { method: "POST", body })
    : client.request<FundraisingGoalRecord>(ADMIN_PATHS.fundraisingGoal(id), { method: "PATCH", body });
}

interface Props {
  /** `"new"` — создание, запись — правка, `null` — окно закрыто. */
  readonly goal: FundraisingGoalRecord | "new" | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function GoalFormDialog({ goal, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={goal !== null} title={goal === "new" ? "Новый этап сбора" : "Этап сбора"} onClose={onClose} isWide>
      {goal === null ? null : <GoalFormBody goal={goal} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

type FieldName = keyof GoalForm;

function GoalFormBody({ goal, onClose, onSaved }: { readonly goal: FundraisingGoalRecord | "new" } & Omit<Props, "goal">) {
  const toast = useToast();
  const record = goal === "new" ? null : goal;
  const [form, setForm] = useState<GoalForm>(() => initialGoalForm(record));
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(saveGoal);
  const check = checkGoalForm(form);
  const errors = isTouched && !check.ok ? check.errors : {};
  const paidKopecks = record?.paidAmountKopecks ?? "0";
  const preview = previewGoal(form, paidKopecks, record?.id);

  const bind = (name: FieldName) => ({
    value: form[name],
    error: errors[name],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (!check.ok) {
      return;
    }

    const body = record === null ? check.body : changedGoalBody(record, check.body);

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    if ((await mutation.run({ id: record?.id ?? null, body })) !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <div className={styles.dialogLayout}>
      <form onSubmit={handleSubmit} noValidate className={styles.dialogForm}>
        <TextField
          label="Название этапа"
          placeholder="На кирпичи"
          maxLength={GOAL_TITLE_MAX}
          hint="Коротко и понятно: «На кирпичи», «На кровлю». Показывается как «Текущий этап»."
          data-autofocus
          {...bind("title")}
        />
        <TextAreaField
          label="Пояснение (необязательно)"
          rows={2}
          maxLength={GOAL_DESCRIPTION_MAX}
          hint="До 200 символов. На телефоне не показывается — там место под форму."
          {...bind("description")}
        />
        <TextField label="Цель этапа, ₽" inputMode="decimal" placeholder="700 000" hint="От 1 000 до 100 000 000 ₽." {...bind("target")} />
        <FieldGrid>
          <TextField label="Начало (по Уфе)" type="datetime-local" hint="С этого момента пожертвования идут в этап." {...bind("startsAt")} />
          <TextField label="Окончание (необязательно)" type="datetime-local" hint="Пусто — без конца." {...bind("endsAt")} />
        </FieldGrid>
        <TextField
          label="Ручная корректировка, ₽"
          inputMode="decimal"
          hint={
            <>
              Поступления, которых нет на сайте: СБП по QR-коду, наличные, переводы по реквизитам. Можно с минусом —
              чтобы исправить ошибку. Пожертвования с сайта за период этапа уже учтены:{" "}
              <b>{formatKopecks(paidKopecks)}</b>.
            </>
          }
          {...bind("adjustment")}
        />
        <FormErrors messages={mutation.errors} />
        <FormActions>
          <Button type="submit" isBusy={mutation.isPending}>
            Сохранить
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Отмена
          </Button>
        </FormActions>
      </form>

      <aside className={styles.previewPane} aria-label="Как будет на главной">
        <p className={styles.previewLabel}>Так блок выглядит на главной</p>
        <div className={`${styles.previewStage} on-dark`}>
          {preview === null ? (
            <p className={styles.previewEmpty}>Укажите цель этапа — появится превью.</p>
          ) : (
            <GoalProgress goal={preview} isPreview />
          )}
        </div>
        <Note>
          <p>
            Этап — это наглядность, а не отдельное назначение денег: по оферте все пожертвования идут на строительство
            мечети в целом. Пишите «На кирпичи», а не «деньги пойдут только на кирпичи».
          </p>
        </Note>
      </aside>
    </div>
  );
}
