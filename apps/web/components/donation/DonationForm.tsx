"use client";

import Image from "next/image";
import Link from "next/link";

import { Checkbox } from "@/components/ui/Checkbox";
import field from "@/components/ui/field.module.css";
import type { Region } from "@/lib/api/types";
import { DONATION_FORM, PAGES } from "@/lib/content";
import { formatCount } from "@/lib/format";

import { AmountPresets } from "./AmountPresets";
import styles from "./DonationForm.module.css";
import { paymentOptionChanges, selectPaymentOption, selectValidAmount } from "./donation-form.model";
import { DonorFields } from "./DonorFields";
import { PaymentMethods } from "./PaymentMethods";
import { useDonationForm } from "./useDonationForm";

interface Props {
  readonly regions: readonly Region[];
  /** Регион из региональной ссылки `/{код}/`, если человек пришёл по ней. */
  readonly initialRegionSlug?: string;
}

const AMOUNT_ID = "donation-amount";
const AMOUNT_ERROR_ID = `${AMOUNT_ID}-error`;
const CONSENT_ID = "donation-consent";
const CONSENT_ERROR_ID = `${CONSENT_ID}-error`;

/** Запас ширины поля суммы под курсор, в символах. */
const AMOUNT_WIDTH_PADDING_CH = 0.5;

/**
 * Форма «Поддержать строительство». Логика — в `useDonationForm`, здесь
 * только разметка. Порядок сверху вниз: кто жертвует → сколько → чем →
 * согласие → кнопка. Вся форма помещается в экран без прокрутки.
 *
 * Сумма в кнопке обновляется живьём: «Пожертвовать 500 ₽» — последнее,
 * что человек читает перед оплатой, и оно должно совпадать с выбранным.
 */
export function DonationForm({ regions, initialRegionSlug }: Props) {
  const form = useDonationForm(regions, initialRegionSlug);
  const { state, errors, status } = form;

  const validAmount = selectValidAmount(state);
  const isBusy = status !== "idle";
  const submitLabel =
    validAmount === null
      ? DONATION_FORM.submit
      : `${DONATION_FORM.submit} ${formatCount(validAmount)} ₽`;
  // Поле суммы растёт вместе с числом, чтобы «₽» стоял сразу за цифрами.
  const amountWidth = `${Math.max(state.amountInput.length, 1) + AMOUNT_WIDTH_PADDING_CH}ch`;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{DONATION_FORM.title}</h2>
          <p className={styles.subtitle}>{DONATION_FORM.subtitle}</p>
        </div>
        <Image
          className={styles.mark}
          src="/brand/logo.svg"
          alt=""
          width={52}
          height={52}
          unoptimized
        />
      </div>

      <form className={styles.form} onSubmit={form.submit} noValidate>
        <DonorFields
          state={state}
          errors={errors}
          onAnonymousChange={form.setAnonymous}
          onNameChange={(donorName) => {
            form.clearError("donorName");
            form.patch({ donorName });
          }}
          onPhoneChange={form.setPhone}
          onBlur={form.validateField}
        />

        <div>
          <div
            className={styles.amountBox}
            data-invalid={errors.amount === undefined ? undefined : true}
          >
            <label className={styles.amountField} htmlFor={AMOUNT_ID}>
              <span className="sr-only">{DONATION_FORM.customAmountLabel}</span>
              <input
                className={styles.amountInput}
                id={AMOUNT_ID}
                name="amount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                style={{ width: amountWidth }}
                value={state.amountInput}
                aria-invalid={errors.amount === undefined ? undefined : true}
                aria-describedby={errors.amount === undefined ? undefined : AMOUNT_ERROR_ID}
                onChange={(event) => {
                  form.setAmountInput(event.target.value);
                }}
                onBlur={() => {
                  form.validateField("amount");
                }}
              />
              <span aria-hidden="true">₽</span>
            </label>

            <AmountPresets selectedPreset={state.selectedPreset} onSelect={form.selectPreset} />
          </div>
          {errors.amount === undefined ? null : (
            <p className={field.error} id={AMOUNT_ERROR_ID}>
              {errors.amount}
            </p>
          )}
        </div>

        <PaymentMethods
          value={selectPaymentOption(state)}
          onChange={(option) => {
            form.patch(paymentOptionChanges(option));
          }}
        />

        <div className={styles.consent}>
          <Checkbox
            id={CONSENT_ID}
            name="personalDataConsent"
            checked={state.personalDataConsent}
            isInvalid={errors.personalDataConsent !== undefined}
            errorId={CONSENT_ERROR_ID}
            onChange={(personalDataConsent) => {
              form.clearError("personalDataConsent");
              form.patch({ personalDataConsent });
            }}
          >
            {DONATION_FORM.consentPrefix}{" "}
            <Link href={PAGES.consent.href} target="_blank" rel="noopener">
              {DONATION_FORM.consentData}
            </Link>{" "}
            {DONATION_FORM.consentJoin}{" "}
            <Link href={PAGES.offer.href} target="_blank" rel="noopener">
              {DONATION_FORM.consentTerms}
            </Link>
          </Checkbox>
          {errors.personalDataConsent === undefined ? null : (
            <p className={field.error} id={CONSENT_ERROR_ID}>
              {errors.personalDataConsent}
            </p>
          )}
        </div>

        {/* Honeypot: человек этого поля не видит и не заполняет.
            Отправляется как есть — заполненное бэкенд отклонит. */}
        <input
          className={styles.honeypot}
          type="text"
          name="antispam"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={state.antispam}
          onChange={(event) => {
            form.patch({ antispam: event.target.value });
          }}
        />

        <div className={styles.actions}>
          {form.formError === null ? null : (
            <p className={styles.formError} role="alert">
              {form.formError}
            </p>
          )}

          <button
            className={`btn btn-block ${styles.submit}`}
            type="submit"
            aria-busy={isBusy}
            disabled={isBusy}
          >
            {status === "submitting" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {DONATION_FORM.submitting}
              </>
            ) : (
              submitLabel
            )}
          </button>

          <div role="status" aria-live="polite">
            {status === "redirecting" ? (
              <p className={styles.success}>{DONATION_FORM.success}</p>
            ) : null}
          </div>
        </div>

        <p className={styles.note}>{DONATION_FORM.commission}</p>
      </form>
    </div>
  );
}
