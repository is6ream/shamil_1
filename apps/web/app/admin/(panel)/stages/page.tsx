"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { StageDialog } from "@/components/admin/stages/StageDialog";
import styles from "@/components/admin/stages/stages.module.css";
import { Badge, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { ReorderButtons } from "@/components/admin/ui/ReorderButtons";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { STAGE_STATUS_LABELS } from "@/lib/admin/labels";
import { formatKopecks } from "@/lib/admin/money";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminStage, StageStatus } from "@/lib/admin/types";
import { useReorder } from "@/lib/admin/use-reorder";
import { pluralize } from "@/lib/format";

const STATUS_TONES: Readonly<Record<StageStatus, "success" | "info" | "neutral">> = {
  done: "success",
  current: "info",
  upcoming: "neutral",
};

export default function StagesPage() {
  const { client } = useAdminSession();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAdminQuery<readonly AdminStage[]>(ADMIN_PATHS.stages);
  const { list, move, isSaving } = useReorder(data, ADMIN_PATHS.stagesOrder);
  const [editing, setEditing] = useState<AdminStage | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminStage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.stage(deleting.id), { method: "DELETE" });
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
      title="Ход стройки"
      lead="Этапы по порядку — так же, как на сайте в блоке «Куда идут пожертвования»."
      actions={<Button onClick={() => setEditing("new")}>Добавить этап</Button>}
    >
      <Note tone="warning">
        <p>
          Сметы этапов при запуске взяты из макета и <b>выдуманы</b>. Замените их настоящими суммами или очистите
          поле — тогда сумма на сайте не покажется.
        </p>
      </Note>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {list !== null && list.length === 0 ? (
        <EmptyState title="Этапов пока нет.">
          <p>Нажмите «Добавить этап» — например, «Земляные работы и фундамент».</p>
        </EmptyState>
      ) : null}
      {list !== null && list.length > 0 ? (
        <ol className={styles.list}>
          {list.map((stage, index) => (
            <li key={stage.id} className={styles.stage}>
              <div className={styles.main}>
                <span className={styles.number}>{index + 1}</span>
                <div>
                  <h2 className={styles.title}>{stage.title}</h2>
                  <p className={styles.meta}>
                    <Badge tone={STATUS_TONES[stage.status]}>{STAGE_STATUS_LABELS[stage.status]}</Badge>
                    <span>Смета: {stage.budgetKopecks === null ? "не названа" : formatKopecks(stage.budgetKopecks)}</span>
                    <span>Освоено: {stage.spentKopecks === null ? "—" : formatKopecks(stage.spentKopecks)}</span>
                    <span>{pluralize(stage.photoMediaIds.length, ["фото", "фото", "фото"])}</span>
                  </p>
                </div>
              </div>
              <div className={styles.actions}>
                <ReorderButtons label={stage.title} index={index} count={list.length} isDisabled={isSaving} onMove={move} />
                <Button variant="ghost" isSmall onClick={() => setEditing(stage)}>
                  Изменить
                </Button>
                <Button variant="ghost" isSmall onClick={() => setDeleting(stage)}>
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <StageDialog
        stage={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Удалить этап?"
        description={<p>Этап «{deleting?.title}» исчезнет с сайта. Фото останутся в медиатеке.</p>}
        confirmLabel="Удалить"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminPage>
  );
}
