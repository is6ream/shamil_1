"use client";

import Link from "next/link";

import { MosqueMark } from "@/components/layout/MosqueMark";
import { Checkbox } from "@/components/ui/Checkbox";
import field from "@/components/ui/field.module.css";
import type { Region } from "@/lib/api/types";
import { DONATION_FORM, PAGES, SECTION_IDS } from "@/lib/content";
import { formatCount } from "@/lib/format";

import { AmountPresets } from "./AmountPresets";
import styles from "./DonationForm.module.css";
import { selectValidAmount } from "./donation-form.model";
import { DonorFields } from "./DonorFields";
import { PaymentMethods } from "./PaymentMethods";
import { RecurrenceToggle } from "./RecurrenceToggle";
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

/**
 * Форма «Внести вклад» (макет v2). Логика — в `useDonationForm`, здесь
 * только разметка.
 *
 * Сумма в кнопке обновляется живьём: «Пожертвовать 2 500 ₽» — последнее,
 * что человек читает перед оплатой, и оно должно совпадать с тем, что
 * он выбрал. При невалидной сумме — просто «Пожертвовать».
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

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{DONATION_FORM.title}</h2>
          <p className={styles.subtitle}>{DONATION_FORM.subtitle}</p>
        </div>
        <span className={styles.mark} aria-hidden="true">
          <MosqueMark />
        </span>
      </div>

      <form className={styles.form} onSubmit={form.submit} noValidate>
        <RecurrenceToggle
          value={state.recurrence}
          onChange={(recurrence) => {
            form.patch({ recurrence });
          }}
        />

        <div>
          <AmountPresets selectedPreset={state.selectedPreset} onSelect={form.selectPreset} />

          <label className={`${field.label} ${styles.customLabel}`} htmlFor={AMOUNT_ID}>
            {DONATION_FORM.customAmountLabel}
          </label>
          <input
            className={field.input}
            id={AMOUNT_ID}
            name="amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={DONATION_FORM.customAmountPlaceholder}
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
          {errors.amount === undefined ? null : (
            <p className={field.error} id={AMOUNT_ERROR_ID}>
              {errors.amount}
            </p>
          )}
        </div>

        <PaymentMethods
          value={state.onlineMethod}
          onChange={(onlineMethod) => {
            form.patch({ onlineMethod });
          }}
        />

        <Checkbox
          id="donation-anonymous"
          name="isAnonymous"
          checked={state.isAnonymous}
          onChange={form.setAnonymous}
        >
          {DONATION_FORM.anonymous}
        </Checkbox>

        <DonorFields
          state={state}
          errors={errors}
          onNameChange={(donorName) => {
            form.clearError("donorName");
            form.patch({ donorName });
          }}
          onPhoneChange={form.setPhone}
          onBlur={form.validateField}
        />

        <div>
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
            <Link href={PAGES.paymentTerms.href} target="_blank" rel="noopener">
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
            className={`btn btn-primary btn-block ${styles.submit}`}
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

        <p className={styles.note}>
          <span className={styles.desktopOnly}>
            {DONATION_FORM.commission} ·{" "}
            <a href={`#${SECTION_IDS.requisites}`}>{DONATION_FORM.transferLink}</a>
          </span>
          <span className={styles.mobileOnly}>{DONATION_FORM.commissionLong}</span>
        </p>
      </form>
    </div>
  );
}
