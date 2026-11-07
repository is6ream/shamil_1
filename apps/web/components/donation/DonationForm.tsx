"use client";

import Image from "next/image";
import Link from "next/link";

import { Checkbox } from "@/components/ui/Checkbox";
import field from "@/components/ui/field.module.css";
import { METRIKA_GOALS } from "@/lib/analytics/goals";
import { metrika } from "@/lib/analytics/metrika";
import { claimOncePerVisit } from "@/lib/analytics/once-per-visit";
import { useInViewOnce } from "@/lib/hooks/useInView";
import type { Region } from "@/lib/api/types";
import { kopecksToRubDisplay, rublesToKopecks } from "@/lib/money";
import { DONATION_FORM, PAGES } from "@/lib/content";
import { DONATION_REQUEST_EVENT, readDonationRequest } from "@/lib/donation-request";
import { useEffect, useRef } from "react";

import { AmountPresets } from "./AmountPresets";
import styles from "./DonationForm.module.css";
import {
  PREVIEW_CAPABILITIES,
  paymentOptionChanges,
  selectPaymentOption,
  selectValidAmount,
} from "./donation-form.model";
import type { DonationCapabilities, DonationSubmit } from "./donation-form.model";
import { DonorFields } from "./DonorFields";
import { PaymentMethods } from "./PaymentMethods";
import { useDonationForm } from "./useDonationForm";

interface Props {
  readonly regions: readonly Region[];
  /** Регион из региональной ссылки `/{код}/`, если человек пришёл по ней. */
  readonly initialRegionSlug?: string;
  readonly capabilities?: DonationCapabilities;
  readonly submitDonation?: DonationSubmit;
}

const AMOUNT_ID = "donation-amount";
const AMOUNT_ERROR_ID = `${AMOUNT_ID}-error`;
const CONSENT_ID = "donation-consent";
const CONSENT_ERROR_ID = `${CONSENT_ID}-error`;

export function DonationForm({
  regions,
  initialRegionSlug,
  capabilities = PREVIEW_CAPABILITIES,
  submitDonation,
}: Props) {
  const form = useDonationForm(regions, initialRegionSlug, capabilities, submitDonation);
  const { state, errors, isBusy, result } = form;
  const amountInput = useRef<HTMLInputElement>(null);

  const [cardRef, inView] = useInViewOnce<HTMLDivElement>(0.5, true);
  useEffect(() => {
    if (inView) metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claimOncePerVisit);
  }, [inView]);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });
  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = readDonationRequest(event);
      if (!request) return;
      formRef.current.patch({ donationType: "one_time" });
      if (request.amountRubles !== null) formRef.current.selectPreset(request.amountRubles);
      requestAnimationFrame(() => {
        amountInput.current?.focus({ preventScroll: true });
        if (request.amountRubles === null) amountInput.current?.select();
      });
    };
    document.addEventListener(DONATION_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(DONATION_REQUEST_EVENT, onRequest);
  }, []);

  const isRecurring = state.donationType === "recurring";
  const oneTimeMethod = selectPaymentOption(state);
  const amount = selectValidAmount(state, capabilities);
  const submitLabel = amount === null ? DONATION_FORM.submit : `Пожертвовать ${kopecksToRubDisplay(rublesToKopecks(amount))}`;
  const unavailable = capabilities.oneTimeMethods.length === 0;

  return (
    <div className={styles.card} data-donation-mode={state.donationType} ref={cardRef}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{DONATION_FORM.title}</h2>
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

      <form className={styles.form} onSubmit={(event) => {
        if (isRecurring) event.preventDefault();
        else void form.submit(event);
      }} noValidate>
        <div className={styles.controls} inert={isBusy}>
          {submitDonation === undefined && (
            <p className={styles.preview}>Предпросмотр формы · платежи отключены</p>
          )}

          <fieldset className={styles.choices}>
            <legend className="sr-only">Тип пожертвования</legend>
            <div className={styles.modes}>
              <label className={styles.mode}>
                <input
                  className="sr-only"
                  type="radio"
                  name="donation-type"
                  checked={!isRecurring}
                  onChange={() => {
                    form.clearError("recurringConsentAccepted");
                    form.patch({ donationType: "one_time" });
                  }}
                />
                Разовое пожертвование
              </label>
              <label className={styles.mode}>
                <input
                  className="sr-only"
                  type="radio"
                  name="donation-type"
                  checked={isRecurring}
                  onChange={() => form.patch({ donationType: "recurring" })}
                />
                Автоплатёж
              </label>
            </div>
          </fieldset>

          {isRecurring ? (
            <div className={styles.comingSoon} role="status">
              <p>Регулярные пожертвования скоро появятся. Сейчас вы можете сделать разовое пожертвование</p>
              <button className={`btn btn-block ${styles.submit}`} type="button"
                onClick={() => form.patch({ donationType: "one_time" })}>
                Сделать разовое пожертвование
              </button>
            </div>
          ) : (<>
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
            <div className={styles.amountHeading}>
              <label className={styles.groupLabel} htmlFor={AMOUNT_ID}>Сумма пожертвования</label>
                <button className={styles.customAmount} type="button" onClick={() => {
                  amountInput.current?.focus();
                  amountInput.current?.select();
                }}>
                  Другая сумма
                </button>
            </div>
            <div
              className={styles.amountBox}
              data-invalid={errors.amount === undefined ? undefined : true}
            >
              <label className={styles.amountField} htmlFor={AMOUNT_ID}>
                <input
                  className={styles.amountInput}
                  id={AMOUNT_ID}
                  name="amount"
                  type="text"
                  ref={amountInput}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={state.amountInput}
                  aria-invalid={errors.amount === undefined ? undefined : true}
                  aria-describedby={errors.amount === undefined ? undefined : AMOUNT_ERROR_ID}
                  onChange={(event) => {
                    form.setAmountInput(event.target.value);
                  }}
                  onBlur={() => {
                    form.validateField("amount");
                    form.commitCustomAmount();
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
            value={capabilities.oneTimeMethods.includes(oneTimeMethod)
              ? oneTimeMethod : capabilities.oneTimeMethods[0] ?? null}
            available={capabilities.oneTimeMethods}
            onChange={(option) => {
              metrika.reachGoal(METRIKA_GOALS.methodSelect, { method: option });
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

          </>)}
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

        {!isRecurring && <div className={styles.actions}>
          {form.formError === null ? null : (
            <p className={styles.formError} role="alert">
              {form.formError}
            </p>
          )}

          <button
            className={`btn btn-block ${styles.submit}`}
            type="submit"
            aria-busy={isBusy}
            disabled={isBusy || unavailable}
          >
            {isBusy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {DONATION_FORM.submitting}
              </>
            ) : (
              submitLabel
            )}
          </button>

          <div role="status" aria-live="polite">
            {result?.message && <p className={styles.success}>{result.message}</p>}
          </div>
        </div>}

        {!isRecurring && submitDonation !== undefined && <p className={styles.note}>{DONATION_FORM.commission}</p>}
      </form>
    </div>
  );
}
