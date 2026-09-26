import field from "@/components/ui/field.module.css";
import { DONATION_FORM } from "@/lib/content";

import type { Recurrence } from "./donation-form.model";
import styles from "./RecurrenceToggle.module.css";

interface Props {
  readonly value: Recurrence;
  readonly onChange: (value: Recurrence) => void;
}

const HINT_ID = "donation-recurrence-hint";

/**
 * «Как часто»: сегмент-контрол на четыре варианта (макет v2).
 *
 * Это группа настоящих радиокнопок: стрелки клавиатуры, `radiogroup`
 * и объявление выбранного варианта браузер даёт сам.
 *
 * Автоплатёж вне MVP (токенизация карты, SMS, личный кабинет), поэтому
 * любой выбор кроме «Разово» сопровождается честной подсказкой: сейчас
 * пройдёт разовое пожертвование. Прятать переключатель нельзя — заказчик
 * назвал регулярные платежи одной из главных целей сайта.
 */
export function RecurrenceToggle({ value, onChange }: Props) {
  const isRecurring = value !== "once";

  return (
    <fieldset className={field.fieldset} aria-describedby={isRecurring ? HINT_ID : undefined}>
      <legend className={field.legend}>{DONATION_FORM.recurrenceLegend}</legend>
      <div className={styles.segment}>
        {DONATION_FORM.recurrence.map((option) => (
          <label className={styles.option} key={option.id}>
            <input
              className="sr-only"
              type="radio"
              name="recurrence"
              value={option.id}
              checked={value === option.id}
              onChange={() => {
                onChange(option.id);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      {isRecurring ? (
        <p className={field.hint} id={HINT_ID}>
          {DONATION_FORM.recurrenceHint}
        </p>
      ) : null}
    </fieldset>
  );
}
