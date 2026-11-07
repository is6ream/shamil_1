"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import type { Region } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { DONATION_FORM } from "@/lib/content";
import { useRegionFromUrl } from "@/lib/hooks/useRegionFromUrl";

import {
  AMOUNT_PRESETS_RUBLES,
  patchDonationState,
  INITIAL_FORM_STATE,
  applyPhoneEdit,
  buildDonationSubmission,
  formatAmountInput,
  hasErrors,
  resolveRegion,
  selectAmountRubles,
  validate,
  withoutError,
} from "./donation-form.model";
import type {
  DonationCapabilities,
  DonationField,
  DonationFormState,
  DonationSubmit,
  FieldErrors,
} from "./donation-form.model";

function presetFor(amountInput: string): number | null {
  const amount = selectAmountRubles({ ...INITIAL_FORM_STATE, amountInput });

  return AMOUNT_PRESETS_RUBLES.find((preset) => preset === amount) ?? null;
}

export function useDonationForm(
  regions: readonly Region[],
  initialRegionSlug: string | undefined,
  config: DonationCapabilities,
  submitDonation?: DonationSubmit,
) {
  const [state, setState] = useState<DonationFormState>(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<DonationSubmit>> | null>(null);
  const [isBusy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const linkSlugFromUrl = useRegionFromUrl();

  const linkSlug = initialRegionSlug ?? linkSlugFromUrl;
  const isKnownLinkSlug = linkSlug !== null && regions.some((region) => region.slug === linkSlug);
  const region = resolveRegion(state, isKnownLinkSlug ? linkSlug : null);

  const clearError = (field: DonationField) => {
    setErrors((current) => withoutError(current, field));
  };

  const patch = (changes: Partial<DonationFormState>) => {
    setFormError(null);
    setResult(null);
    setState((current) => patchDonationState(current, changes));
  };

  /** Проверка одного поля при уходе из него. */
  const validateField = (field: DonationField) => {
    const message = validate(state, config)[field];

    setErrors((current) =>
      message === undefined ? withoutError(current, field) : { ...current, [field]: message },
    );
  };

  const setAmountInput = (raw: string) => {
    const amountInput = formatAmountInput(raw);

    clearError("amount");
    patch({ amountInput, selectedPreset: presetFor(amountInput) });
  };

  const selectPreset = (rubles: number) => {
    clearError("amount");
    patch({ amountInput: formatAmountInput(String(rubles)), selectedPreset: rubles });
  };

  const setPhone = (raw: string) => {
    clearError("phone");
    patch({ phone: applyPhoneEdit(state.phone, raw) });
  };

  const setAnonymous = (isAnonymous: boolean) => {
    // Публичной подписи у анонимного доната быть не может — CHECK
    // `donation_anonymous_has_no_public_name` в базе. Поле очищаем сразу,
    // чтобы не отправить имя, которое человек уже не видит.
    // Телефон при анонимности скрыт — значит, и не отправляется: уходить
    // должно только то, что человек видит в форме.
    clearError("donorName");
    clearError("phone");
    patch(isAnonymous ? { isAnonymous, donorName: "", phone: "" } : { isAnonymous });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inFlight.current) return;
    const found = validate(state, config);
    setErrors(found);
    setFormError(null);
    setResult(null);

    if (hasErrors(found)) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    if (submitDonation === undefined) {
      setFormError("Это предпросмотр формы. Отправка пожертвований здесь отключена.");
      return;
    }

    const data = buildDonationSubmission(state, config, region);
    if (data === null) {
      setFormError("Этот вариант пожертвования пока недоступен.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    try {
      setResult(await submitDonation(data));
    } catch (error: unknown) {
      setFormError(error instanceof ApiError ? error.messages.join(". ") : DONATION_FORM.unknownError);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return {
    state,
    errors,
    formError,
    result,
    isBusy,
    patch,
    clearError,
    validateField,
    setAmountInput,
    selectPreset,
    setPhone,
    setAnonymous,
    submit,
  } as const;
}

export type DonationFormController = ReturnType<typeof useDonationForm>;
