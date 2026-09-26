"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

import { ApiError, createDonation } from "@/lib/api/client";
import { buildCreateDonationBody } from "@/lib/api/donation-body";
import type { Region } from "@/lib/api/types";
import { DONATION_FORM } from "@/lib/content";
import { REGION_QUERY_PARAM } from "@/lib/routes";

import {
  AMOUNT_PRESETS_RUBLES,
  INITIAL_FORM_STATE,
  applyPhoneEdit,
  formatAmountInput,
  hasErrors,
  normalizePhone,
  resolveRegion,
  selectAmountRubles,
  sendsFullName,
  validate,
  withoutError,
} from "./donation-form.model";
import type { DonationField, DonationFormState, FieldErrors } from "./donation-form.model";

/**
 * Пауза перед уходом на оплату: человек успевает прочитать
 * «Джазакаллаху хайран!» и понять, что форма сработала.
 */
const REDIRECT_DELAY_MS = 800;

export type SubmitStatus = "idle" | "submitting" | "redirecting";

/**
 * Адресная строка за время жизни формы не меняется: региональная ссылка —
 * это вход на страницу, а не навигация внутри неё. Подписываться не на что,
 * но `useSyncExternalStore` требует функцию подписки.
 */
const subscribeToNothing = () => () => {};

function readRegionFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get(REGION_QUERY_PARAM);
}

function presetFor(amountInput: string): number | null {
  const amount = selectAmountRubles({ ...INITIAL_FORM_STATE, amountInput });

  return AMOUNT_PRESETS_RUBLES.find((preset) => preset === amount) ?? null;
}

/**
 * Состояние и поведение формы доната. Разметка — в `DonationForm`.
 *
 * Двухшаговая схема из CLAUDE.md: клиент проверяет только формат, заказ
 * создаёт сервер, он же назначает сумму списания и подписывает ссылку.
 *
 * Валидация — по blur и по submit, не на каждый символ: ошибка «введите
 * сумму» под полем, в котором человек ещё печатает, только мешает.
 */
export function useDonationForm(regions: readonly Region[], initialRegionSlug?: string) {
  const [state, setState] = useState<DonationFormState>(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current !== null) {
        clearTimeout(redirectTimer.current);
      }
    },
    [],
  );

  /*
   * Регион из адресной строки (`?region=…`) читается через
   * `useSyncExternalStore`, а не эффектом: серверный снимок `null`, и главная
   * остаётся статической — обращение к `searchParams` сделало бы её
   * динамической, а репост в WhatsApp упирается в скорость первого ответа.
   */
  const linkSlugFromUrl = useSyncExternalStore(
    subscribeToNothing,
    readRegionFromLocation,
    () => null,
  );

  const linkSlug = initialRegionSlug ?? linkSlugFromUrl;
  const isKnownLinkSlug = linkSlug !== null && regions.some((region) => region.slug === linkSlug);
  const region = resolveRegion(state, isKnownLinkSlug ? linkSlug : null);

  const clearError = (field: DonationField) => {
    setErrors((current) => withoutError(current, field));
  };

  const patch = (changes: Partial<DonationFormState>) => {
    setState((current) => ({ ...current, ...changes }));
  };

  /** Проверка одного поля при уходе из него. */
  const validateField = (field: DonationField) => {
    const message = validate(state)[field];

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
    setState((current) => ({ ...current, phone: applyPhoneEdit(current.phone, raw) }));
  };

  const setAnonymous = (isAnonymous: boolean) => {
    // Публичной подписи у анонимного доната быть не может — CHECK
    // `donation_anonymous_has_no_public_name` в базе. Поле очищаем сразу,
    // чтобы не отправить имя, которое человек уже не видит.
    clearError("donorName");
    patch(isAnonymous ? { isAnonymous, donorName: "" } : { isAnonymous });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const found = validate(state);

    setErrors(found);
    setFormError(null);

    const amountRubles = selectAmountRubles(state);

    if (hasErrors(found) || amountRubles === null) {
      return;
    }

    setStatus("submitting");

    try {
      const { redirectUrl } = await createDonation(
        buildCreateDonationBody({
          amountRubles,
          isAnonymous: state.isAnonymous,
          donorName: state.isAnonymous ? "" : state.donorName,
          // Имя для сверки поступления по выписке — только на пути
          // «по реквизитам»: в онлайне сверять нечего.
          fullName: sendsFullName(state) ? state.donorName : "",
          phone: normalizePhone(state.phone),
          personalDataConsent: state.personalDataConsent,
          regionSlug: region.slug,
          regionSource: region.source,
          antispam: state.antispam,
          // `recurrence` и `onlineMethod` в тело не уходят: в DTO их нет.
          channel: state.channel,
        }),
      );

      // Сервер сам решает, куда идти: Robokassa либо наша страница
      // реквизитов, если активен ручной провайдер.
      setStatus("redirecting");
      redirectTimer.current = setTimeout(() => {
        window.location.assign(redirectUrl);
      }, REDIRECT_DELAY_MS);
    } catch (error: unknown) {
      setStatus("idle");
      setFormError(
        error instanceof ApiError ? error.messages.join(". ") : DONATION_FORM.unknownError,
      );
    }
  };

  return {
    state,
    errors,
    formError,
    status,
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
