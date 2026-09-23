"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";

import { ApiError, createDonation } from "@/lib/api/client";
import { buildCreateDonationBody } from "@/lib/api/donation-body";
import type { DonationChannel } from "@/lib/api/donation-body";
import type { Region } from "@/lib/api/types";
import { MANUAL_TRANSFER_PATH, REGION_QUERY_PARAM, buildOrderUrl } from "@/lib/routes";
import { MIN_DONATION_RUBLES } from "@/lib/site";

import { AmountPresets } from "./AmountPresets";
import { BankDetails } from "./BankDetails";
import { ChannelTabs } from "./ChannelTabs";
import { CheckIcon } from "./CheckIcon";
import { DonorFields } from "./DonorFields";
import { PaymentMethods } from "./PaymentMethods";
import { RecurrenceToggle } from "./RecurrenceToggle";
import { RegionSelect } from "./RegionSelect";
import styles from "./DonationForm.module.css";
import {
  AMOUNT_PRESETS_RUBLES,
  INITIAL_FORM_STATE,
  hasErrors,
  normalizePhone,
  requiresPersonalDataConsent,
  resolveRegion,
  selectAmountRubles,
  sendsFullName,
  validate,
} from "./donation-form.model";
import type { DonationFormState, FieldErrors } from "./donation-form.model";

const PANEL_ID = "donation-panel";

/**
 * Адресная строка за время жизни формы не меняется: региональная ссылка —
 * это вход на страницу, а не навигация внутри неё. Подписываться не на что,
 * но `useSyncExternalStore` требует функцию подписки.
 */
const subscribeToNothing = () => () => {};

function readRegionFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get(REGION_QUERY_PARAM);
}

interface Props {
  readonly regions: readonly Region[];
  /** Регион из региональной ссылки `/{код}/`, если человек пришёл по ней. */
  readonly initialRegionSlug?: string;
}

/**
 * Форма пожертвования.
 *
 * Двухшаговая схема из CLAUDE.md: клиент проверяет только формат, заказ
 * создаёт сервер, он же назначает сумму списания и подписывает ссылку.
 * Сумма, набранная здесь, до провайдера не доходит — она нужна серверу
 * только чтобы проверить диапазон.
 */
export function DonationForm({ regions, initialRegionSlug }: Props) {
  const [state, setState] = useState<DonationFormState>(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  /**
   * Регион из адресной строки (`?region=…`) — внешнее состояние, поэтому
   * читается через `useSyncExternalStore`, а не эффектом с `setState`:
   * эффект дал бы лишний каскадный рендер формы на каждом заходе.
   *
   * Серверный снимок — `null`: на сервере адресной строки нет, а обращаться
   * к `searchParams` страницы нельзя, это перевело бы главную в динамический
   * рендер. Репост в WhatsApp упирается в скорость первого ответа.
   */
  const linkSlugFromUrl = useSyncExternalStore(
    subscribeToNothing,
    readRegionFromLocation,
    () => null,
  );

  const linkSlug = initialRegionSlug ?? linkSlugFromUrl;
  const isKnownLinkSlug = linkSlug !== null && regions.some((region) => region.slug === linkSlug);
  const region = resolveRegion(state, isKnownLinkSlug ? linkSlug : null);

  const patch = (changes: Partial<DonationFormState>) => {
    setState((current) => ({ ...current, ...changes }));
  };

  const onAmountInput = (value: string) => {
    const preset = AMOUNT_PRESETS_RUBLES.find((item) => String(item) === value.trim());

    patch({ amountInput: value, selectedPreset: preset ?? null });
  };

  const onPresetSelect = (rubles: number) => {
    patch({ amountInput: String(rubles), selectedPreset: rubles });
  };

  const onCustomAmount = () => {
    patch({ amountInput: "", selectedPreset: null });
    amountRef.current?.focus();
  };

  const onChannelChange = (channel: DonationChannel) => {
    setFormError(null);
    patch({ channel });
  };

  const onRegionChange = (slug: string) => {
    patch({ regionChoice: slug });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const found = validate(state);

    setErrors(found);
    setFormError(null);

    if (hasErrors(found)) {
      return;
    }

    const amountRubles = selectAmountRubles(state);

    if (amountRubles === null) {
      return;
    }

    setSubmitting(true);

    try {
      const { orderId, redirectUrl } = await createDonation(
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
          channel: state.channel,
        }),
      );

      /*
       * Онлайн — идём туда, куда сказал сервер: это либо Robokassa,
       * либо наша страница реквизитов, если активен ручной провайдер.
       *
       * «Расчётный счёт» — ведём на свою страницу реквизитов сами.
       * Провайдер сейчас выбирается глобально (`PAYMENT_PROVIDER`), и на
       * боевой Robokassa человек, выбравший перевод по реквизитам, уехал
       * бы на оплату картой. Когда бэкенд примет `channel`, эта ветка
       * исчезнет: сервер вернёт нужный redirectUrl сам.
       */
      window.location.href =
        state.channel === "transfer"
          ? buildOrderUrl(MANUAL_TRANSFER_PATH, orderId)
          : redirectUrl;
    } catch (error: unknown) {
      setSubmitting(false);

      if (error instanceof ApiError) {
        setFormError(error.messages.join(". "));
        return;
      }

      setFormError("Что-то пошло не так. Попробуйте ещё раз.");
    }
  };

  const needsConsent = requiresPersonalDataConsent(state);
  const isTransfer = state.channel === "transfer";

  return (
    <div className="card" id="pay">
      <h2>Внести свой вклад</h2>
      <p className="sub">Минимальная сумма — {MIN_DONATION_RUBLES} ₽, та самая, что в слогане</p>

      <ChannelTabs value={state.channel} onChange={onChannelChange} panelId={PANEL_ID} />

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`donation-tab-${state.channel}`}
        tabIndex={-1}
      >
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className="check">
            <input
              className="sr-only"
              type="checkbox"
              name="isAnonymous"
              checked={state.isAnonymous}
              onChange={(event) => {
                patch({ isAnonymous: event.target.checked });
              }}
            />
            <span className="bx">
              <CheckIcon />
            </span>
            <span>
              Анонимное пожертвование
              <span className={`micro ${styles.checkHint}`}>
                включено по умолчанию — садака лучше всего, когда о ней не знают
              </span>
            </span>
          </label>

          <div className={styles.section}>
            <AmountPresets
              selectedPreset={state.selectedPreset}
              onSelect={onPresetSelect}
              onCustom={onCustomAmount}
            />

            <label className="sr-only" htmlFor="donation-amount">
              Сумма пожертвования в рублях
            </label>
            <input
              className={`input big ${styles.amountField}`}
              id="donation-amount"
              name="amount"
              ref={amountRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={`${MIN_DONATION_RUBLES} ₽`}
              value={state.amountInput}
              aria-invalid={errors.amount === undefined ? undefined : true}
              aria-describedby={errors.amount === undefined ? undefined : "donation-amount-error"}
              onChange={(event) => {
                onAmountInput(event.target.value);
              }}
            />
            {errors.amount === undefined ? null : (
              <p className="field-error" id="donation-amount-error">
                {errors.amount}
              </p>
            )}
          </div>

          {state.isAnonymous ? null : (
            <div className={styles.section}>
              <DonorFields
                state={state}
                errors={errors}
                needsConsent={needsConsent}
                onChange={patch}
              />
            </div>
          )}

          <div className={styles.section}>
            <RegionSelect
              regions={regions}
              value={region.slug}
              onChange={onRegionChange}
              isFromLink={region.source === "link"}
            />
          </div>

          <div className={styles.section}>
            <RecurrenceToggle />
          </div>

          {isTransfer ? (
            <div className={styles.section}>
              <h3>Перевод по реквизитам</h3>
              <p className={styles.transferNote}>
                Нажмите кнопку — мы заведём пожертвование и покажем реквизиты вместе
                с номером платежа. Назовите этот номер в назначении перевода, по нему
                мы найдём ваши деньги в выписке.
              </p>
              <BankDetails />
            </div>
          ) : (
            <div className={styles.section}>
              <PaymentMethods
                value={state.onlineMethod}
                onChange={(onlineMethod) => {
                  patch({ onlineMethod });
                }}
              />
            </div>
          )}

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
              patch({ antispam: event.target.value });
            }}
          />

          {formError === null ? null : (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <button
            className={`btn btn-primary btn-block ${styles.submit}`}
            type="submit"
            aria-busy={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Отправляем…
              </>
            ) : isTransfer ? (
              "Получить реквизиты"
            ) : (
              "Внести свой вклад"
            )}
          </button>

          <p className="micro">
            Оплата проходит на стороне платёжного сервиса. Данные карты не попадают
            на наш сайт и нигде у нас не хранятся.
          </p>
        </form>
      </div>
    </div>
  );
}
