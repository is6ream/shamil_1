"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import styles from "@/components/admin/goals/goals.module.css";
import { MonthlyGoalDialog } from "@/components/admin/goals/MonthlyGoalDialog";
import { FormActions, Meter, Note, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminMutation, useAdminQuery, useUnsavedChangesWarning } from "@/lib/admin/hooks";
import { checkRublesInput, formatKopecks, kopecksToRublesInput, percentOf } from "@/lib/admin/money";
import { useAdminSession } from "@/lib/admin/session";
import { formatPlainDate } from "@/lib/admin/time";
import type { CampaignAdmin, MonthlyGoalRecord } from "@/lib/admin/types";
import { formatCount } from "@/lib/format";

function updateGoal(client: AdminClient, goalKopecks: string): Promise<CampaignAdmin> {
  return client.request<CampaignAdmin>(ADMIN_PATHS.campaign, { method: "PATCH", body: { goalKopecks } });
}

function GoalForm({ campaign, onSaved }: { readonly campaign: CampaignAdmin; readonly onSaved: () => void }) {
  const toast = useToast();
  const initial = kopecksToRublesInput(campaign.goalKopecks);
  const [amount, setAmount] = useState(initial);
  const mutation = useAdminMutation(updateGoal);
  const check = checkRublesInput(amount, { max: LIMITS.goalMaxKopecks, maxLabel: "10 000 000 000 ₽" });

  useUnsavedChangesWarning(amount !== initial);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!check.ok) {
      return;
    }

    if ((await mutation.run(check.kopecks)) !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.goalForm}>
      <TextField
        label="Общая цель сбора, ₽"
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        error={check.ok ? null : check.error}
      />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending} disabled={!check.ok || amount === initial}>
          Сохранить цель
        </Button>
      </FormActions>
    </form>
  );
}

interface GoalRowProps {
  readonly goal: MonthlyGoalRecord;
  readonly canEdit: boolean;
  readonly onEdit: (goal: MonthlyGoalRecord) => void;
  readonly onDelete: (goal: MonthlyGoalRecord) => void;
}

function MonthlyGoalRow({ goal, canEdit, onEdit, onDelete }: GoalRowProps) {
  const percent = percentOf(goal.collectedKopecks, goal.goalKopecks);

  return (
    <li className={styles.goalRow}>
      <div className={styles.goalHead}>
        <b>
          {formatPlainDate(goal.periodStart)} — {formatPlainDate(goal.periodEnd)}
        </b>
        <span>
          {formatKopecks(goal.collectedKopecks)} из {formatKopecks(goal.goalKopecks)} ·{" "}
          {percent.toLocaleString("ru-RU")}%
        </span>
      </div>
      <Meter label={`Цель ${formatPlainDate(goal.periodStart)}`} percent={percent} />
      {canEdit ? (
        <div className={styles.goalActions}>
          <Button variant="ghost" isSmall onClick={() => onEdit(goal)}>
            Изменить
          </Button>
          <Button variant="ghost" isSmall onClick={() => onDelete(goal)}>
            Удалить
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export default function GoalsPage() {
  const { can, client } = useAdminSession();
  const toast = useToast();
  const canEdit = can("goals");
  const { data, error, isLoading, reload } = useAdminQuery<CampaignAdmin>(ADMIN_PATHS.campaign);
  const [editing, setEditing] = useState<MonthlyGoalRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<MonthlyGoalRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.monthlyGoal(deleting.id), { method: "DELETE" });
      toast.success(SAVED_MESSAGE);
      reload();
    } catch (deleteError: unknown) {
      toast.error(errorMessage(deleteError));
    } finally {
      setIsDeleting(false);
      setDeleting(null);
    }
  }

  return (
    <AdminPage
      title="Цели сбора"
      lead={canEdit ? undefined : "Только просмотр: цели меняют суперадмин и редактор."}
      actions={canEdit ? <Button onClick={() => setEditing("new")}>Добавить цель месяца</Button> : null}
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Section title="Общая цель">
            <p className={styles.total}>
              Собрано <b>{formatKopecks(data.collectedKopecks)}</b> из {formatKopecks(data.goalKopecks)} ·{" "}
              {formatCount(data.donationsCount)} пожертвований
            </p>
            <Meter label="Собрано от общей цели" percent={percentOf(data.collectedKopecks, data.goalKopecks)} />
            {canEdit ? <GoalForm key={data.goalKopecks} campaign={data} onSaved={reload} /> : null}
          </Section>

          <Section title="Цели месяца">
            <Note>
              <p>
                Даты целей месяца — <b>по московскому времени</b>, обе включительно. Месячная шкала на сайте
                показывает «не хватает именно тебя»: без неё общая цель на старте видна как доли процента.
              </p>
            </Note>
            {data.monthlyGoals.length === 0 ? (
              <EmptyState title="Целей месяца пока нет.">
                {canEdit ? <p>Нажмите «Добавить цель месяца» и укажите сумму и период.</p> : null}
              </EmptyState>
            ) : (
              <ul className={styles.goals}>
                {data.monthlyGoals.map((goal) => (
                  <MonthlyGoalRow
                    key={goal.id}
                    goal={goal}
                    canEdit={canEdit}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}

      <MonthlyGoalDialog
        goal={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Удалить цель месяца?"
        description={
          deleting ? (
            <p>
              Цель {formatPlainDate(deleting.periodStart)} — {formatPlainDate(deleting.periodEnd)} на{" "}
              {formatKopecks(deleting.goalKopecks)} исчезнет с сайта. Пожертвования при этом не меняются.
            </p>
          ) : null
        }
        confirmLabel="Удалить"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminPage>
  );
}
