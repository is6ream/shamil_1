"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FieldGrid, FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { changedGoalFields, checkMonthlyGoal, monthBounds } from "@/lib/admin/goals";
import type { MonthlyGoalForm } from "@/lib/admin/goals";
import { useAdminMutation } from "@/lib/admin/hooks";
import { kopecksToRublesInput } from "@/lib/admin/money";
import { moscowToday } from "@/lib/admin/time";
import type { MonthlyGoalBody, MonthlyGoalRecord } from "@/lib/admin/types";

interface SaveArgs {
  readonly id: string | null;
  readonly body: Partial<MonthlyGoalBody>;
}

function saveGoal(client: AdminClient, { id, body }: SaveArgs): Promise<MonthlyGoalRecord> {
  return id === null
    ? client.request<MonthlyGoalRecord>(ADMIN_PATHS.monthlyGoals, { method: "POST", body })
    : client.request<MonthlyGoalRecord>(ADMIN_PATHS.monthlyGoal(id), { method: "PATCH", body });
}

interface Props {
  /** `"new"` — создание, запись — правка, `null` — окно закрыто. */
  readonly goal: MonthlyGoalRecord | "new" | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function MonthlyGoalDialog({ goal, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={goal !== null} title={goal === "new" ? "Новая цель месяца" : "Цель месяца"} onClose={onClose}>
      {goal === null ? null : <GoalFormBody goal={goal} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function initialForm(goal: MonthlyGoalRecord | "new"): MonthlyGoalForm {
  if (goal !== "new") {
    return {
      periodStart: goal.periodStart,
      periodEnd: goal.periodEnd,
      amount: kopecksToRublesInput(goal.goalKopecks),
    };
  }

  const { start, end } = monthBounds(moscowToday());

  return { periodStart: start, periodEnd: end, amount: "" };
}

function GoalFormBody({ goal, onClose, onSaved }: { readonly goal: MonthlyGoalRecord | "new" } & Omit<Props, "goal">) {
  const toast = useToast();
  const [form, setForm] = useState<MonthlyGoalForm>(() => initialForm(goal));
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(saveGoal);
  const check = checkMonthlyGoal(form);
  const errors = isTouched && !check.ok ? check.errors : {};
  const isOverlap = mutation.errors.some((message) => message.includes("пересекается"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (!check.ok) {
      return;
    }

    const body =
      goal === "new"
        ? check.body
        : changedGoalFields(
            { periodStart: goal.periodStart, periodEnd: goal.periodEnd, goalKopecks: goal.goalKopecks },
            check.body,
          );

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    if ((await mutation.run({ id: goal === "new" ? null : goal.id, body })) !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGrid>
        <TextField
          label="Начало (по Москве)"
          type="date"
          value={form.periodStart}
          onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))}
          error={errors.periodStart}
        />
        <TextField
          label="Конец, включительно"
          type="date"
          value={form.periodEnd}
          onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))}
          error={errors.periodEnd}
        />
      </FieldGrid>
      <TextField
        label="Цель на период, ₽"
        inputMode="decimal"
        value={form.amount}
        onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
        error={errors.amount}
        hint="«Собрано» сразу включит уже оплаченные пожертвования этого периода."
        data-autofocus
      />
      <FormErrors messages={mutation.errors} />
      {isOverlap ? (
        <Note tone="warning">
          <p>
            На эти даты уже есть другая цель месяца. Сдвиньте даты так, чтобы периоды не пересекались, или сначала
            измените ту цель.
          </p>
        </Note>
      ) : null}
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}
