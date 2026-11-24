"use client";

import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon, HeartIcon, CoinsIcon, RepeatIcon } from "@/components/icons/Icons";
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
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AmountPresets } from "./AmountPresets";
import styles from "./DonationForm.module.css";
import {
  AMOUNT_PRESETS_RUBLES,
  DONATION_FREQUENCIES,
  ONE_TIME_AMOUNT_PRESETS_RUBLES,
  PREVIEW_CAPABILITIES,
  selectAmountRubles,
  selectRecurringOptions,
  validate,
  paymentOptionChanges,
  selectPaymentOption,
  selectValidAmount,
} from "./donation-form.model";
import type { DonationCapabilities, DonationSubmit } from "./donation-form.model";
import { DonorFields } from "./DonorFields";
import { PaymentMethods } from "./PaymentMethods";
import { useDonationForm } from "./useDonationForm";

interface Props {
  readonly donorReady?: boolean;
  readonly consentRevision?: number;
  readonly donorAccess?: ReactNode;
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
  donorAccess,
  donorReady = true,
  consentRevision = 0,
}: Props) {
  const form = useDonationForm(regions, initialRegionSlug, capabilities, submitDonation, consentRevision, donorReady);
  const { state, errors, isBusy, result } = form;
  const amountInput = useRef<HTMLInputElement>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const isRecurring = state.donationType === "recurring";
  const recurring = capabilities.recurring;
  const { method: recurringMethod, frequency: availableFrequency } = selectRecurringOptions(state, capabilities);
  const frequency = availableFrequency ?? state.frequency;
  const frequencies = recurring?.frequencies ?? PREVIEW_CAPABILITIES.recurring?.frequencies ?? [];
  const showCheckout = !isRecurring || recurring !== null;
  const min = isRecurring ? recurring?.minRubles ?? capabilities.minRubles : capabilities.minRubles;
  const max = Math.min(capabilities.maxRubles ?? Infinity, isRecurring ? recurring?.maxRubles ?? Infinity : Infinity);
  const modePresets = isRecurring ? AMOUNT_PRESETS_RUBLES : ONE_TIME_AMOUNT_PRESETS_RUBLES;
  const presets = modePresets.filter(preset => preset >= min && preset <= max);
  const amount = selectValidAmount(state, capabilities);
  const enteredAmount = selectAmountRubles(state);
  const outsideRecurringLimits = isRecurring && enteredAmount !== null && (enteredAmount < min || enteredAmount > max);
  const amountError = errors.amount ?? (outsideRecurringLimits ? validate(state, capabilities).amount : undefined);
  const showAmountInput = customOpen || amountError !== undefined || !presets.includes(state.selectedPreset ?? 0);

  const focusAmount = () => {
    requestAnimationFrame(() => {
      amountInput.current?.focus({ preventScroll: true });
      amountInput.current?.select();
    });
  };

  const [cardRef, inView] = useInViewOnce<HTMLDivElement>(0.5, true);
  useEffect(() => {
    if (inView) metrika.reachGoalOncePerVisit(METRIKA_GOALS.formView, claimOncePerVisit);
  }, [inView]);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const stacked = window.matchMedia("(max-width: 850px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      const distance = stacked.matches ? -card.getBoundingClientRect().top : window.scrollY;
      card.style.setProperty("--donation-scroll", String(Math.min(1, Math.max(0, distance / 360))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [cardRef]);

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });
  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = readDonationRequest(event);
      if (!request) return;
      formRef.current.clearError("recurringConsentAccepted");
      formRef.current.clearError("amount");
      formRef.current.patch({ donationType: "one_time" });
      if (request.amountRubles !== null) formRef.current.selectPreset(request.amountRubles);
      const preset = request.amountRubles !== null && ONE_TIME_AMOUNT_PRESETS_RUBLES.includes(request.amountRubles);
      setCustomOpen(!preset);
      requestAnimationFrame(() => {
        const checked = cardRef.current?.querySelector<HTMLInputElement>('input[name="amount-preset"]:checked');
        const target = preset ? checked ?? amountInput.current : amountInput.current;
        target?.focus({ preventScroll: true });
        if (!preset) amountInput.current?.select();
      });
    };
    document.addEventListener(DONATION_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(DONATION_REQUEST_EVENT, onRequest);
  }, [cardRef]);

  const oneTimeMethod = selectPaymentOption(state);
  const submitLabel = amount === null ? DONATION_FORM.submit : `Пожертвовать ${kopecksToRubDisplay(rublesToKopecks(amount))}`;
  const unavailable = capabilities.oneTimeMethods.length === 0;

  return (
    <div className={styles.card} data-donation-mode={state.donationType} ref={cardRef}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{DONATION_FORM.title}</h2>
          <p className={styles.subtitle}>Ваш вклад — это шаг к доброму делу</p>
        </div>
        <Image
          className={styles.mark}
          src="/brand/logo-gold.webp"
          alt=""
          width={61}
          height={61}
          unoptimized
        />
      </div>

      <form className={styles.form} onSubmit={event => void form.submit(event)} noValidate>
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
                    form.clearError("amount");
                    form.patch({ donationType: "one_time" });
                  }}
                />
                <CoinsIcon />
                <span>Разовое пожертвование</span>
              </label>
              <label className={styles.mode}>
                <input
                  className="sr-only"
                  type="radio"
                  name="donation-type"
                  checked={isRecurring}
                  onChange={() => {
                    form.clearError("amount");
                    form.patch({ donationType: "recurring" });
                  }}
                />
                <RepeatIcon />
                <span>Автоплатёж</span>
              </label>
            </div>
          </fieldset>

          {!showCheckout && <p className={styles.notice}>Оформление автоплатежей пока недоступно.</p>}

          <div>
            <div className={styles.amountHeading}>
              <label className={styles.groupLabel} htmlFor={showAmountInput ? AMOUNT_ID : undefined}>Сумма пожертвования</label>
              <button
                className={styles.customAmount}
                type="button"
                aria-controls={AMOUNT_ID}
                onClick={() => {
                  setCustomOpen(true);
                  focusAmount();
                }}
              >
                Другая сумма
              </button>
            </div>
            <AmountPresets
              presets={presets}
              selectedPreset={state.selectedPreset}
              onSelect={preset => {
                setCustomOpen(false);
                form.selectPreset(preset);
              }}
            />
            <div className={styles.amountBox} hidden={!showAmountInput} data-invalid={amountError === undefined ? undefined : true}>
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
                aria-invalid={amountError === undefined ? undefined : true}
                aria-describedby={amountError === undefined ? undefined : AMOUNT_ERROR_ID}
                onChange={event => form.setAmountInput(event.target.value)}
                onBlur={() => {
                  form.validateField("amount");
                  form.commitCustomAmount();
                }}
              />
              <span aria-hidden="true">₽</span>
            </div>
            {amountError && <p className={field.error} id={AMOUNT_ERROR_ID} role="alert">{amountError}</p>}
          </div>

          {isRecurring && <fieldset className={styles.choices}>
            <legend className={styles.groupLabel}>График автоплатежа</legend>
            <div className={styles.frequencies}>
              {frequencies.map(value => <label className={styles.frequency} key={value}>
                <input className="sr-only" type="radio" name="frequency" value={value} checked={frequency === value}
                  onChange={() => form.patch({ frequency: value })} />
                {DONATION_FREQUENCIES[value].label}
              </label>)}
            </div>
          </fieldset>}

          <PaymentMethods
            value={isRecurring ? recurringMethod : capabilities.oneTimeMethods.includes(oneTimeMethod)
              ? oneTimeMethod : capabilities.oneTimeMethods[0] ?? null}
            available={isRecurring ? recurring?.methods ?? [] : capabilities.oneTimeMethods}
            onChange={option => {
              if (isRecurring) {
                if (option !== "transfer") form.patch({ recurringMethod: option });
                return;
              }
              metrika.reachGoal(METRIKA_GOALS.methodSelect, { method: option });
              form.patch(paymentOptionChanges(option));
            }}
          />

          <DonorFields
            state={state}
            errors={errors}
            onAnonymousChange={form.setAnonymous}
            onNameChange={donorName => {
              form.clearError("donorName");
              form.patch({ donorName });
            }}
            onPhoneChange={form.setPhone}
            onBlur={form.validateField}
          />

          <div hidden={!isRecurring || !donorAccess}><div className={styles.donorAccess}>{donorAccess}</div></div>
          {isRecurring && <div className={styles.recurringDetails}>
            {amount !== null && <p className={styles.summaryAmount}>Каждое списание: {kopecksToRubDisplay(rublesToKopecks(amount))}, {DONATION_FREQUENCIES[frequency].cadence}.</p>}
            <fieldset className={styles.choices} disabled={isBusy}>
              <legend className="sr-only">Согласие на повторные списания</legend>
              <Checkbox id="recurring-consent" name="recurringConsent" checked={state.recurringConsentAccepted}
                isInvalid={errors.recurringConsentAccepted !== undefined} errorId="recurring-consent-error"
                onChange={recurringConsentAccepted => {
                  form.clearError("recurringConsentAccepted");
                  form.patch({ recurringConsentAccepted });
                }}>
                Я даю согласие на регулярные списания выбранной суммы по указанному графику, на <Link href={PAGES.consent.href} target="_blank" rel="noopener">обработку персональных данных</Link> и принимаю условия <Link href="/oferta#recurring-payments" target="_blank" rel="noopener">публичной оферты, включая правила рекуррентных платежей</Link>.
              </Checkbox>
              {errors.recurringConsentAccepted && <p className={field.error} id="recurring-consent-error" role="alert">{errors.recurringConsentAccepted}</p>}
            </fieldset>
          </div>}

          {!isRecurring && <div className={styles.consent}>
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
          </div>}
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

        {showCheckout && <div className={styles.actions}>
          {form.formError === null ? null : (
            <p className={styles.formError} role="alert">
              {form.formError}
            </p>
          )}

          <button
            className={`btn btn-primary btn-block ${styles.submit}`}
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
              <>
                <HeartIcon className={styles.heart} />
                <span>{isRecurring ? `Оформить автоплатёж${amount === null ? "" : ` · ${kopecksToRubDisplay(rublesToKopecks(amount))}`}` : submitLabel}</span>
                <ArrowRightIcon />
              </>
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
