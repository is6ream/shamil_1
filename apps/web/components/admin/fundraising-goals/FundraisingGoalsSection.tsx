"use client";

import { useState } from "react";

import { Badge, Meter, Note, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Pagination } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { GOAL_STATUS_LABELS, GOAL_STATUS_TONES, goalActions } from "@/lib/admin/fundraising-goals";
import { useAdminQuery } from "@/lib/admin/hooks";
import { formatKopecks } from "@/lib/admin/money";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { FundraisingGoalRecord, Paged } from "@/lib/admin/types";

import styles from "./fundraising-goals.module.css";
import { GoalFormDialog } from "./GoalFormDialog";

type GoalAction = "activate" | "complete" | "archive";

interface PendingAction {
  readonly goal: FundraisingGoalRecord;
  readonly action: GoalAction;
}

const ACTION_LABELS: Readonly<Record<GoalAction, string>> = {
  activate: "Сделать активным",
  complete: "Завершить",
  archive: "В архив",
};

function periodText(goal: FundraisingGoalRecord): string {
  return goal.endsAt === null
    ? `с ${formatDateTime(goal.startsAt)}`
    : `${formatDateTime(goal.startsAt)} — ${formatDateTime(goal.endsAt)}`;
}

function confirmText(pending: PendingAction, active: FundraisingGoalRecord | null): string {
  const title = `«${pending.goal.title}»`;

  switch (pending.action) {
    case "activate":
      return active === null || active.id === pending.goal.id
        ? `Этап ${title} появится на главной.`
        : `Этап ${title} появится на главной. Текущий этап «${active.title}» будет завершён.`;
    case "complete":
      return `Этап ${title} уйдёт с главной. Блок этапа на сайте исчезнет, пока не активируете другой.`;
    case "archive":
      return `Этап ${title} уйдёт в архив. Из архива его не вернуть и не изменить — только просмотр.${
        pending.goal.status === "ACTIVE" ? " Блок этапа на главной исчезнет." : ""
      }`;
  }
}

/**
 * Этапы сбора («малые цели»): активный показывается на первом экране главной.
 * Физического удаления нет — архив. Активировать новый этап можно, не
 * завершая текущий: сервер завершит его в той же транзакции.
 */
export function FundraisingGoalsSection() {
  const { can, client } = useAdminSession();
  const toast = useToast();
  const canEdit = can("goals");
  const [page, setPage] = useState(1);
  const { data, error, isLoading, reload } = useAdminQuery<Paged<FundraisingGoalRecord>>(
    `${ADMIN_PATHS.fundraisingGoals}?page=${page}&pageSize=${LIMITS.pageSize}`,
  );
  const [editing, setEditing] = useState<FundraisingGoalRecord | "new" | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const active = data?.items.find((goal) => goal.status === "ACTIVE") ?? null;

  async function handleConfirm() {
    if (pending === null || isRunning) {
      return;
    }

    setIsRunning(true);

    try {
      await client.request(ADMIN_PATHS.fundraisingGoalAction(pending.goal.id, pending.action), { method: "POST" });
      toast.success(SAVED_MESSAGE);
      reload();
    } catch (actionError: unknown) {
      toast.error(errorMessage(actionError));
      reload();
    } finally {
      setIsRunning(false);
      setPending(null);
    }
  }

  const columns: readonly Column<FundraisingGoalRecord>[] = [
    {
      key: "title",
      header: "Этап",
      render: (goal) => (
        <div className={styles.titleCell}>
          <b>{goal.title}</b>
          {goal.description ? <span>{goal.description}</span> : null}
        </div>
      ),
    },
    { key: "target", header: "Цель", isNumeric: true, render: (goal) => formatKopecks(goal.targetAmountKopecks) },
    {
      key: "collected",
      header: "Собрано",
      isNumeric: true,
      render: (goal) => (
        <div className={styles.collectedCell}>
          <span>{formatKopecks(goal.collectedAmountKopecks)}</span>
          {goal.manualAdjustmentKopecks === "0" ? null : (
            <small>
              сайт {formatKopecks(goal.paidAmountKopecks)} · вручную {formatKopecks(goal.manualAdjustmentKopecks)}
            </small>
          )}
        </div>
      ),
    },
    {
      key: "percent",
      header: "%",
      isNumeric: true,
      render: (goal) => (
        <div className={styles.percentCell}>
          <span>{goal.percent}%</span>
          <Meter label={`Этап «${goal.title}»`} percent={goal.percent} />
        </div>
      ),
    },
    {
      key: "status",
      header: "Статус",
      render: (goal) => (
        <div className={styles.statusCell}>
          <Badge tone={GOAL_STATUS_TONES[goal.status]}>{GOAL_STATUS_LABELS[goal.status]}</Badge>
          {goal.isReached ? <Badge tone="success">Цель достигнута</Badge> : null}
        </div>
      ),
    },
    { key: "period", header: "Период", render: (goal) => <span className={styles.period}>{periodText(goal)}</span> },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "Действия",
            render: (goal: FundraisingGoalRecord) => <RowActions goal={goal} onEdit={setEditing} onAction={setPending} />,
          },
        ]
      : []),
  ];

  return (
    <Section
      title="Этапы сбора на главной"
      actions={canEdit ? <Button onClick={() => setEditing("new")}>Новый этап</Button> : null}
    >
      <Note>
        <p>
          Активный этап — «Текущий этап: На кирпичи — 700 000 ₽» — стоит на первом экране сайта. Активным бывает только
          один: новый автоматически завершит текущий. <b>Собрано</b> = пожертвования с сайта за период этапа +{" "}
          <b>ручная корректировка</b>. Пока онлайн-оплата не подключена и деньги идут по QR-коду СБП, вносите такие
          поступления корректировкой в этапе или ручным пожертвованием в разделе «Пожертвования».
        </p>
      </Note>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="Этапов пока нет.">
          {canEdit ? <p>Нажмите «Новый этап», задайте название и сумму, затем «Сделать активным».</p> : null}
        </EmptyState>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className={styles.table}>
          <DataTable
            caption="Этапы сбора"
            columns={columns}
            rows={data.items}
            rowKey={(goal) => goal.id}
            rowClassName={(goal) => (goal.status === "ACTIVE" ? styles.activeRow : undefined)}
          />
          <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </div>
      ) : null}

      <GoalFormDialog
        goal={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={pending !== null}
        title={pending === null ? "" : `${ACTION_LABELS[pending.action]}?`}
        description={pending === null ? null : <p>{confirmText(pending, active)}</p>}
        confirmLabel={pending === null ? "" : ACTION_LABELS[pending.action]}
        isDanger={pending?.action === "archive"}
        isBusy={isRunning}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </Section>
  );
}

interface RowActionsProps {
  readonly goal: FundraisingGoalRecord;
  readonly onEdit: (goal: FundraisingGoalRecord) => void;
  readonly onAction: (pending: PendingAction) => void;
}

function RowActions({ goal, onEdit, onAction }: RowActionsProps) {
  const actions = goalActions(goal.status);

  if (!actions.canEdit) {
    return <span className={styles.readOnly}>Только просмотр</span>;
  }

  return (
    <div className={styles.rowActions}>
      {actions.canActivate ? (
        <Button isSmall onClick={() => onAction({ goal, action: "activate" })}>
          {ACTION_LABELS.activate}
        </Button>
      ) : null}
      <Button variant="ghost" isSmall onClick={() => onEdit(goal)}>
        Изменить
      </Button>
      {actions.canComplete ? (
        <Button variant="ghost" isSmall onClick={() => onAction({ goal, action: "complete" })}>
          {ACTION_LABELS.complete}
        </Button>
      ) : null}
      {actions.canArchive ? (
        <Button variant="ghost" isSmall onClick={() => onAction({ goal, action: "archive" })}>
          {ACTION_LABELS.archive}
        </Button>
      ) : null}
    </div>
  );
}
