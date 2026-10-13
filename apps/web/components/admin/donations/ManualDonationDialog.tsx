"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { CheckboxField, FormErrors, SelectField, TextAreaField, TextField } from "@/components/admin/ui/Field";
import type { SelectOption } from "@/components/admin/ui/Field";
import { ConfirmDialog, Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import {
  DONOR_NAME_MAX,
  MANUAL_COMMENT_MAX,
  checkManualDonation,
  looksLikePersonalData,
} from "@/lib/admin/donations";
import type { ManualDonationForm } from "@/lib/admin/donations";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation, useUnsavedChangesWarning } from "@/lib/admin/hooks";
import { MANUAL_METHOD_LABELS } from "@/lib/admin/labels";
import { formatKopecks, kopecksToRublesInput } from "@/lib/admin/money";
import { toUfaDateTimeInput } from "@/lib/admin/time";
import { MANUAL_METHODS } from "@/lib/admin/types";
import { randomUuid } from "@/lib/admin/uuid";
import type { ManualDonationBody, ManualDonationResult, ManualMethod } from "@/lib/admin/types";

import styles from "./donations.module.css";

const METHOD_OPTIONS: readonly SelectOption[] = MANUAL_METHODS.map((method) => ({
  value: method,
  label: MANUAL_METHOD_LABELS[method],
}));

function createManual(client: AdminClient, body: ManualDonationBody): Promise<ManualDonationResult> {
  return client.request<ManualDonationResult>(ADMIN_PATHS.manualDonation, { method: "POST", body });
}

interface Props {
  readonly isOpen: boolean;
  readonly regions: readonly SelectOption[];
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

export function ManualDonationDialog({ isOpen, regions, onClose, onCreated }: Props) {
  return (
    <Modal isOpen={isOpen} title="Внести поступление" onClose={onClose}>
      <ManualDonationFormBody regions={regions} onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

/**
 * Тело живёт, пока окно открыто (Modal рендерит детей только открытым).
 * Поэтому ключ идемпотентности создаётся ровно один раз при открытии формы:
 * повторная отправка той же формы — после ошибки сети или двойного нажатия —
 * уйдёт с тем же ключом, и API второй раз не зачислит (API.md §13, D-27).
 */
function ManualDonationFormBody({ regions, onClose, onCreated }: Omit<Props, "isOpen">) {
  const toast = useToast();
  const [idempotencyKey] = useState(() => randomUuid());
  const [form, setForm] = useState<ManualDonationForm>(() => ({
    amount: "",
    method: "cash",
    comment: "",
    paidAt: toUfaDateTimeInput(Date.now()),
    isPaidAtTouched: false,
    regionSlug: "",
    isAnonymous: true,
    donorName: "",
  }));
  const [isTouched, setIsTouched] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const mutation = useAdminMutation(createManual);
  const check = checkManualDonation(form);
  const errors = isTouched && !check.ok ? check.errors : {};
  const isDirty = form.amount !== "" || form.comment !== "";

  useUnsavedChangesWarning(isDirty);

  function set<K extends keyof ManualDonationForm>(key: K, value: ManualDonationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (check.ok) {
      setIsConfirming(true);
    }
  }

  async function handleConfirm() {
    if (!check.ok) {
      return;
    }

    const result = await mutation.run({ idempotencyKey, ...check.body });

    setIsConfirming(false);

    if (result === undefined) {
      return;
    }

    if (result.applied) {
      toast.success(`Поступление № ${result.invoiceNo} на ${formatKopecks(result.paidAmountKopecks)} внесено.`);
    } else {
      toast.success(`Это поступление уже внесено (№ ${result.invoiceNo}) — второй раз не зачислено.`);
    }

    onCreated();
  }

  const confirmAmount = check.ok ? kopecksToRublesInput(check.body.amountKopecks) : "";

  return (
    <>
      <form className={styles.manualForm} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Сумма, ₽"
          inputMode="decimal"
          autoComplete="off"
          value={form.amount}
          onChange={(event) => set("amount", event.target.value)}
          error={errors.amount}
          data-autofocus
        />
        <SelectField
          label="Способ"
          options={METHOD_OPTIONS}
          value={form.method}
          onChange={(event) => set("method", event.target.value as ManualMethod)}
        />
        <TextAreaField
          label="Комментарий"
          value={form.comment}
          maxLength={MANUAL_COMMENT_MAX}
          onChange={(event) => set("comment", event.target.value)}
          error={errors.comment}
          hint="Что это за деньги: «наличные после джума-намаза», «перевод по выписке за 08.10». Без имён и телефонов."
        />
        {looksLikePersonalData(form.comment) ? (
          <Note tone="warning">
            <p>Похоже, в комментарии телефон. Уберите его — комментарий видят все сотрудники.</p>
          </Note>
        ) : null}
        <TextField
          label="Когда поступили деньги (время Уфы)"
          type="datetime-local"
          value={form.paidAt}
          onChange={(event) => setForm((current) => ({ ...current, paidAt: event.target.value, isPaidAtTouched: true }))}
          error={errors.paidAt}
          hint="Не меняйте, если деньги пришли только что."
        />
        <SelectField
          label="Регион (необязательно)"
          emptyLabel="Не указан"
          options={regions}
          value={form.regionSlug}
          onChange={(event) => set("regionSlug", event.target.value)}
        />
        <CheckboxField
          label="Анонимно"
          checked={form.isAnonymous}
          onChange={(event) => set("isAnonymous", event.target.checked)}
          hint="Садака — скрытое поклонение: без подписи по умолчанию."
        />
        {form.isAnonymous ? null : (
          <TextField
            label="Публичная подпись"
            value={form.donorName}
            maxLength={DONOR_NAME_MAX}
            onChange={(event) => set("donorName", event.target.value)}
            error={errors.donorName}
            hint="Видна на сайте в ленте и топе. Только с согласия жертвователя."
          />
        )}
        <FormErrors messages={mutation.errors} />
        <FormActions>
          <Button type="submit" isBusy={mutation.isPending}>
            Внести
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Отмена
          </Button>
        </FormActions>
      </form>

      <ConfirmDialog
        isOpen={isConfirming}
        title="Проверьте сумму"
        description={
          <p>
            Будет зачислено <b>{check.ok ? formatKopecks(check.body.amountKopecks) : ""}</b> (
            {MANUAL_METHOD_LABELS[form.method].toLowerCase()}). Сумма сбора на сайте вырастет сразу. Введите сумму
            ещё раз, чтобы подтвердить.
          </p>
        }
        typedConfirmation={{ label: "Сумма, ₽", expected: confirmAmount }}
        confirmLabel="Зачислить"
        isBusy={mutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirming(false)}
      />
    </>
  );
}
