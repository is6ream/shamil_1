"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FieldGrid, FormActions } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, SelectField, TextField } from "@/components/admin/ui/Field";
import type { SelectOption } from "@/components/admin/ui/Field";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { MANUAL_MAX_KOPECKS } from "@/lib/admin/donations";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import { MANUAL_METHOD_LABELS } from "@/lib/admin/labels";
import { checkRublesInput, formatKopecks, kopecksToRublesInput } from "@/lib/admin/money";
import { MANUAL_METHODS } from "@/lib/admin/types";
import type { AdminDonation, ConfirmDonationBody, ConfirmDonationResult, ManualMethod } from "@/lib/admin/types";

const METHOD_OPTIONS: readonly SelectOption[] = MANUAL_METHODS.map((method) => ({
  value: method,
  label: MANUAL_METHOD_LABELS[method],
}));

interface Args {
  readonly id: string;
  readonly body: ConfirmDonationBody;
}

function confirmTransfer(client: AdminClient, { id, body }: Args): Promise<ConfirmDonationResult> {
  return client.request<ConfirmDonationResult>(ADMIN_PATHS.donationConfirm(id), { method: "POST", body });
}

interface Props {
  readonly donation: AdminDonation;
  readonly onConfirmed: () => void;
}

/**
 * Подтверждение перевода по реквизитам (§13). Фактическую сумму и способ
 * указывают, только если они разошлись с заказом; пусто — не отправляем.
 */
export function ConfirmTransferForm({ donation, onConfirmed }: Props) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualMethod | "">("");
  const [isConfirming, setIsConfirming] = useState(false);
  const mutation = useAdminMutation(confirmTransfer);
  const amountCheck = amount.trim() === "" ? null : checkRublesInput(amount, { max: MANUAL_MAX_KOPECKS });
  const amountError = amountCheck !== null && !amountCheck.ok ? amountCheck.error : null;
  const finalKopecks = amountCheck?.ok ? amountCheck.kopecks : donation.amountKopecks;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (amountError === null) {
      setIsConfirming(true);
    }
  }

  async function handleConfirm() {
    const body: ConfirmDonationBody = {
      ...(amountCheck?.ok ? { amountKopecks: amountCheck.kopecks } : {}),
      ...(method === "" ? {} : { method }),
    };
    const result = await mutation.run({ id: donation.id, body });

    setIsConfirming(false);

    if (result === undefined) {
      return;
    }

    toast.success(
      result.applied
        ? `Перевод подтверждён: ${formatKopecks(result.paidAmountKopecks)}.`
        : "Этот перевод уже был подтверждён раньше — второй раз не зачислено.",
    );
    onConfirmed();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGrid>
        <TextField
          label="Фактическая сумма, ₽ (если отличается)"
          inputMode="decimal"
          autoComplete="off"
          placeholder={kopecksToRublesInput(donation.amountKopecks)}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={amountError}
          hint={`По заказу: ${formatKopecks(donation.amountKopecks)}`}
        />
        <SelectField
          label="Способ (если отличается)"
          emptyLabel="Как в заказе"
          options={METHOD_OPTIONS}
          value={method}
          onChange={(event) => setMethod(event.target.value as ManualMethod | "")}
        />
      </FieldGrid>
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Подтвердить перевод
        </Button>
      </FormActions>

      <ConfirmDialog
        isOpen={isConfirming}
        title="Деньги пришли на счёт?"
        description={
          <p>
            Пожертвование № {donation.invoiceNo} станет оплаченным на <b>{formatKopecks(finalKopecks)}</b>. Сверьте с
            банковской выпиской и введите сумму ещё раз.
          </p>
        }
        typedConfirmation={{ label: "Сумма, ₽", expected: kopecksToRublesInput(finalKopecks) }}
        confirmLabel="Подтвердить"
        isBusy={mutation.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirming(false)}
      />
    </form>
  );
}
