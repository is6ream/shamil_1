"use client";

import { useState } from "react";

import { MediaField } from "@/components/admin/media/MediaField";
import { FieldGrid, KeyValueList, Note } from "@/components/admin/ui/Blocks";
import { TextField } from "@/components/admin/ui/Field";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { checkRequisites, digitsOnly } from "@/lib/admin/content";
import type { RequisitesBlock } from "@/lib/admin/types";

import { BlockForm } from "./BlockForm";
import { useBlockForm } from "./use-block-form";

/**
 * Реквизиты расчётного счёта — только суперадмин (D-17): сюда придут деньги.
 * Перед сохранением — окно с введёнными цифрами и повтором номера счёта.
 */
export function RequisitesForm({ initial, onSaved }: { readonly initial: RequisitesBlock; readonly onSaved: () => void }) {
  const form = useBlockForm("requisites", initial, checkRequisites, onSaved);
  const { draft, update, errors } = form;
  const [isConfirming, setIsConfirming] = useState(false);
  const account = digitsOnly(draft.accountNumber);

  async function handleConfirm() {
    await form.save();
    setIsConfirming(false);
  }

  return (
    <>
      <Note tone="warning">
        <p>
          <b>Сверьте каждую цифру с банковской выпиской — сюда придут деньги.</b> Пустое поле на сайте показывается
          как «Уточняется». Наименование, ИНН и ОГРН организации меняются только разработчиком.
        </p>
      </Note>
      <BlockForm
        isPending={form.isPending}
        isDirty={form.isDirty}
        serverErrors={form.serverErrors}
        hasErrors={Object.keys(errors).length > 0}
        onSubmit={() => {
          if (form.validate()) {
            setIsConfirming(true);
          }
        }}
      >
        <FieldGrid>
          <TextField
            label="Расчётный счёт"
            inputMode="numeric"
            autoComplete="off"
            value={draft.accountNumber ?? ""}
            onChange={(e) => update({ accountNumber: e.target.value })}
            error={errors.accountNumber}
            hint="20 цифр"
          />
          <TextField
            label="Корреспондентский счёт"
            inputMode="numeric"
            autoComplete="off"
            value={draft.correspondentAccount ?? ""}
            onChange={(e) => update({ correspondentAccount: e.target.value })}
            error={errors.correspondentAccount}
            hint="20 цифр"
          />
          <TextField
            label="БИК"
            inputMode="numeric"
            autoComplete="off"
            value={draft.bik ?? ""}
            onChange={(e) => update({ bik: e.target.value })}
            error={errors.bik}
            hint="9 цифр"
          />
          <TextField
            label="КПП"
            inputMode="numeric"
            autoComplete="off"
            value={draft.kpp ?? ""}
            onChange={(e) => update({ kpp: e.target.value })}
            error={errors.kpp}
            hint="9 цифр"
          />
        </FieldGrid>
        <TextField
          label="Банк"
          value={draft.bankName ?? ""}
          maxLength={200}
          onChange={(e) => update({ bankName: e.target.value })}
          error={errors.bankName}
        />
        <MediaField
          label="QR-код СБП"
          mediaId={draft.sbpQrMediaId}
          hint="на сайте QR не показывается"
          onChange={(sbpQrMediaId) => update({ sbpQrMediaId })}
        />
      </BlockForm>

      <ConfirmDialog
        isOpen={isConfirming}
        title="Сохранить реквизиты?"
        description={
          <KeyValueList
            rows={[
              { label: "Расчётный счёт", value: account ?? "уточняется" },
              { label: "Корр. счёт", value: digitsOnly(draft.correspondentAccount) ?? "уточняется" },
              { label: "БИК", value: digitsOnly(draft.bik) ?? "уточняется" },
              { label: "КПП", value: digitsOnly(draft.kpp) ?? "уточняется" },
              { label: "Банк", value: draft.bankName?.trim() || "уточняется" },
            ]}
          />
        }
        typedConfirmation={account === null ? undefined : { label: "Последние 4 цифры счёта", expected: account.slice(-4) }}
        confirmLabel="Сохранить реквизиты"
        isBusy={form.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirming(false)}
      />
    </>
  );
}
