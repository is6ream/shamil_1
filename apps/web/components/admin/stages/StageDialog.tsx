"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { PhotoListEditor } from "@/components/admin/media/PhotoListEditor";
import { FieldGrid, FormActions } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, SelectField, TextAreaField, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { useAdminMutation, useUnsavedChangesWarning } from "@/lib/admin/hooks";
import { STAGE_STATUS_LABELS } from "@/lib/admin/labels";
import { EMPTY_STAGE_FORM, STAGE_DESCRIPTION_MAX, STAGE_TITLE_MAX, checkStage, stageToForm } from "@/lib/admin/stages";
import type { StageForm } from "@/lib/admin/stages";
import type { AdminStage, StageBody, StageStatus } from "@/lib/admin/types";

const STATUS_OPTIONS = (Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((value) => ({
  value,
  label: STAGE_STATUS_LABELS[value],
}));

interface SaveArgs {
  readonly id: string | null;
  readonly body: StageBody;
}

function saveStage(client: AdminClient, { id, body }: SaveArgs): Promise<AdminStage> {
  return id === null
    ? client.request<AdminStage>(ADMIN_PATHS.stages, { method: "POST", body })
    : client.request<AdminStage>(ADMIN_PATHS.stage(id), { method: "PATCH", body });
}

interface Props {
  /** `"new"` — создание, этап — правка, `null` — закрыто. */
  readonly stage: AdminStage | "new" | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function StageDialog({ stage, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={stage !== null} title={stage === "new" ? "Новый этап" : "Этап стройки"} onClose={onClose} isWide>
      {stage === null ? null : <StageFormBody stage={stage} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function StageFormBody({ stage, onClose, onSaved }: { readonly stage: AdminStage | "new" } & Omit<Props, "stage">) {
  const toast = useToast();
  const [initial] = useState<StageForm>(() => (stage === "new" ? EMPTY_STAGE_FORM : stageToForm(stage)));
  const [form, setForm] = useState<StageForm>(initial);
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(saveStage);
  const check = checkStage(form);
  const errors = isTouched && !check.ok ? check.errors : {};

  useUnsavedChangesWarning(form !== initial);

  function set<K extends keyof StageForm>(key: K, value: StageForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (!check.ok) {
      return;
    }

    if ((await mutation.run({ id: stage === "new" ? null : stage.id, body: check.body })) !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGrid>
        <TextField
          label="Название этапа"
          value={form.title}
          maxLength={STAGE_TITLE_MAX}
          onChange={(event) => set("title", event.target.value)}
          error={errors.title}
          data-autofocus
        />
        <SelectField
          label="Статус"
          options={STATUS_OPTIONS}
          value={form.status}
          onChange={(event) => set("status", event.target.value as StageStatus)}
        />
        <TextField
          label="Смета, ₽"
          inputMode="decimal"
          value={form.budget}
          onChange={(event) => set("budget", event.target.value)}
          error={errors.budget}
          hint="Пусто — сумма не названа, на сайте её не будет."
        />
        <TextField
          label="Освоено, ₽"
          inputMode="decimal"
          value={form.spent}
          onChange={(event) => set("spent", event.target.value)}
          error={errors.spent}
          hint="Сколько уже потрачено на этот этап."
        />
      </FieldGrid>
      <TextAreaField
        label="Описание"
        value={form.description}
        maxLength={STAGE_DESCRIPTION_MAX}
        rows={5}
        onChange={(event) => set("description", event.target.value)}
        error={errors.description}
        hint={`Что сделано и что дальше — простым текстом. До ${STAGE_DESCRIPTION_MAX} символов.`}
      />
      <PhotoListEditor
        photos={form.photos}
        max={LIMITS.stagePhotos}
        error={errors.photos}
        onChange={(photos) => set("photos", photos)}
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
  );
}
