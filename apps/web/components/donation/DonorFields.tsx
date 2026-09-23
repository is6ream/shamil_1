import { CheckIcon } from "./CheckIcon";
import type { DonationFormState, FieldErrors } from "./donation-form.model";

interface Props {
  readonly state: DonationFormState;
  readonly errors: FieldErrors;
  readonly needsConsent: boolean;
  readonly onChange: (patch: Partial<DonationFormState>) => void;
}

/**
 * Имя и телефон. Показываются, только когда человек снял анонимность:
 * анонимный донат остаётся в два поля — сумма и регион.
 *
 * Имя идёт публичной подписью в ленту и топ донатеров, телефон хранится
 * отдельной таблицей и в публичные выборки не попадает (152-ФЗ). Без
 * согласия бэкенд не создаст строку с ПДн вовсе — ни телефона, ни имени
 * в базе не появится.
 */
export function DonorFields({ state, errors, needsConsent, onChange }: Props) {
  return (
    <>
      <label className="field-label" htmlFor="donation-donor-name">
        Имя и фамилия
      </label>
      <input
        className="input"
        id="donation-donor-name"
        name="donorName"
        type="text"
        autoComplete="name"
        maxLength={120}
        placeholder="Как подписать пожертвование"
        value={state.donorName}
        aria-invalid={errors.donorName === undefined ? undefined : true}
        aria-describedby={errors.donorName === undefined ? undefined : "donation-donor-name-error"}
        onChange={(event) => {
          onChange({ donorName: event.target.value });
        }}
      />
      {errors.donorName === undefined ? null : (
        <p className="field-error" id="donation-donor-name-error">
          {errors.donorName}
        </p>
      )}

      <label className="field-label" htmlFor="donation-phone">
        Телефон <span className="muted">— необязательно</span>
      </label>
      <input
        className="input"
        id="donation-phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 917 123-45-67"
        value={state.phone}
        aria-invalid={errors.phone === undefined ? undefined : true}
        aria-describedby={
          errors.phone === undefined ? "donation-phone-hint" : "donation-phone-error"
        }
        onChange={(event) => {
          onChange({ phone: event.target.value });
        }}
      />
      {errors.phone === undefined ? (
        <p className="micro" id="donation-phone-hint">
          Нужен только на случай, если с платежом что-то пойдёт не так. В рейтингах
          и ленте он не показывается.
        </p>
      ) : (
        <p className="field-error" id="donation-phone-error">
          {errors.phone}
        </p>
      )}

      {needsConsent ? (
        <>
          <label className="check">
            <input
              className="sr-only"
              type="checkbox"
              name="personalDataConsent"
              checked={state.personalDataConsent}
              aria-invalid={errors.personalDataConsent === undefined ? undefined : true}
              aria-describedby={
                errors.personalDataConsent === undefined ? undefined : "donation-consent-error"
              }
              onChange={(event) => {
                onChange({ personalDataConsent: event.target.checked });
              }}
            />
            <span className="bx">
              <CheckIcon />
            </span>
            <span>Согласен на обработку персональных данных и условия оплаты</span>
          </label>
          {errors.personalDataConsent === undefined ? null : (
            <p className="field-error" id="donation-consent-error">
              {errors.personalDataConsent}
            </p>
          )}
        </>
      ) : null}
    </>
  );
}
