import field from "@/components/ui/field.module.css";
import { DONATION_FORM } from "@/lib/content";

import type { DonationField, DonationFormState, FieldErrors } from "./donation-form.model";
import styles from "./DonorFields.module.css";

interface Props {
  readonly state: DonationFormState;
  readonly errors: FieldErrors;
  readonly onNameChange: (donorName: string) => void;
  readonly onPhoneChange: (raw: string) => void;
  readonly onBlur: (field: DonationField) => void;
}

/** Максимальная длина имени — зеркало `@MaxLength(120)` в DTO. */
const NAME_MAX_LENGTH = 120;

const NAME_ID = "donation-donor-name";
const PHONE_ID = "donation-phone";

/**
 * Имя и телефон, в ряд на десктопе и столбиком на телефоне.
 *
 * Имя — публичная подпись в ленте. При анонимном донате поле заблокировано
 * и пусто: публичной подписи у анонимного доната быть не может.
 *
 * Телефон хранится отдельной таблицей и в публичные выборки не попадает
 * (152-ФЗ). Подпись — просто «Телефон», не «для чека»: чек ККТ не
 * формируем (решение заказчика 20.09.2026), обещать его нельзя.
 */
export function DonorFields({ state, errors, onNameChange, onPhoneChange, onBlur }: Props) {
  const nameErrorId = `${NAME_ID}-error`;
  const phoneErrorId = `${PHONE_ID}-error`;

  return (
    <div className={styles.row}>
      <div>
        <label className={field.label} htmlFor={NAME_ID}>
          {DONATION_FORM.nameLabel}
        </label>
        <input
          className={field.input}
          id={NAME_ID}
          name="donorName"
          type="text"
          autoComplete="given-name"
          maxLength={NAME_MAX_LENGTH}
          placeholder={DONATION_FORM.namePlaceholder}
          value={state.donorName}
          disabled={state.isAnonymous}
          aria-invalid={errors.donorName === undefined ? undefined : true}
          aria-describedby={errors.donorName === undefined ? undefined : nameErrorId}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
          onBlur={() => {
            onBlur("donorName");
          }}
        />
        {errors.donorName === undefined ? null : (
          <p className={field.error} id={nameErrorId}>
            {errors.donorName}
          </p>
        )}
      </div>

      <div>
        <label className={field.label} htmlFor={PHONE_ID}>
          {DONATION_FORM.phoneLabel}
        </label>
        <input
          className={field.input}
          id={PHONE_ID}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={DONATION_FORM.phonePlaceholder}
          value={state.phone}
          aria-invalid={errors.phone === undefined ? undefined : true}
          aria-describedby={errors.phone === undefined ? undefined : phoneErrorId}
          onChange={(event) => {
            onPhoneChange(event.target.value);
          }}
          onBlur={() => {
            onBlur("phone");
          }}
        />
        {errors.phone === undefined ? null : (
          <p className={field.error} id={phoneErrorId}>
            {errors.phone}
          </p>
        )}
      </div>
    </div>
  );
}
