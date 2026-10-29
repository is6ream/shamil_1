import { CheckMarkIcon } from "@/components/icons/Icons";
import field from "@/components/ui/field.module.css";
import { DONATION_FORM } from "@/lib/content";

import type { DonationField, DonationFormState, FieldErrors } from "./donation-form.model";
import styles from "./DonorFields.module.css";

interface Props {
  readonly state: DonationFormState;
  readonly errors: FieldErrors;
  readonly onAnonymousChange: (isAnonymous: boolean) => void;
  readonly onNameChange: (donorName: string) => void;
  readonly onPhoneChange: (raw: string) => void;
  readonly onBlur: (field: DonationField) => void;
}

/** Максимальная длина имени — зеркало `@MaxLength(120)` в DTO. */
const NAME_MAX_LENGTH = 120;

const NAME_ID = "donation-donor-name";
const PHONE_ID = "donation-phone";
const ANONYMOUS_ID = "donation-anonymous";

/**
 * Имя с переключателем «Анонимно» прямо в поле, телефон — под ним.
 *
 * Анонимность включена по умолчанию (садака — скрытое поклонение): поле
 * имени заблокировано и показывает «Аноним», телефон скрыт. Сняв галочку,
 * человек видит оба поля. Скрытый телефон не отправляется — его очищает
 * `setAnonymous`.
 *
 * Телефон хранится отдельной таблицей и в публичные выборки не попадает
 * (152-ФЗ). Подпись — не «для чека»: чек ККТ не формируем.
 */
export function DonorFields({
  state,
  errors,
  onAnonymousChange,
  onNameChange,
  onPhoneChange,
  onBlur,
}: Props) {
  const nameErrorId = `${NAME_ID}-error`;
  const phoneErrorId = `${PHONE_ID}-error`;

  return (
    <div className={styles.stack}>
      <div>
        <div className={styles.box} data-invalid={errors.donorName === undefined ? undefined : true}>
          <label className="sr-only" htmlFor={NAME_ID}>
            {DONATION_FORM.nameLabel}
          </label>
          <input
            className={styles.input}
            id={NAME_ID}
            name="donorName"
            type="text"
            autoComplete="given-name"
            maxLength={NAME_MAX_LENGTH}
            placeholder={
              state.isAnonymous ? DONATION_FORM.anonymousPlaceholder : DONATION_FORM.namePlaceholder
            }
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

          <label className={styles.anonymous} htmlFor={ANONYMOUS_ID}>
            <span>{DONATION_FORM.anonymous}</span>
            <span className={styles.check}>
              <input
                className={styles.checkInput}
                id={ANONYMOUS_ID}
                name="isAnonymous"
                type="checkbox"
                checked={state.isAnonymous}
                onChange={(event) => {
                  onAnonymousChange(event.target.checked);
                }}
              />
              <CheckMarkIcon className={styles.checkMark} />
            </span>
          </label>
        </div>
        {errors.donorName === undefined ? null : (
          <p className={field.error} id={nameErrorId}>
            {errors.donorName}
          </p>
        )}
      </div>

      {state.isAnonymous ? null : (
        <div>
          <div className={styles.box} data-invalid={errors.phone === undefined ? undefined : true}>
            <label className="sr-only" htmlFor={PHONE_ID}>
              {DONATION_FORM.phoneLabel}
            </label>
            <input
              className={styles.input}
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
          </div>
          {errors.phone === undefined ? null : (
            <p className={field.error} id={phoneErrorId}>
              {errors.phone}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
