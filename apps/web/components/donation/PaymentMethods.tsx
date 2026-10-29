import { CheckMarkIcon } from "@/components/icons/Icons";
import { DONATION_FORM } from "@/lib/content";

import type { PaymentOptionId } from "./donation-form.model";
import { PaymentIcon } from "./PaymentIcons";
import styles from "./PaymentMethods.module.css";

interface Props {
  readonly value: PaymentOptionId;
  readonly onChange: (option: PaymentOptionId) => void;
}

/**
 * Способы оплаты: сетка 2×2 и «Расчётный счёт» во всю ширину.
 *
 * Визуально — плитки с квадратной галочкой, по смыслу — одна радиогруппа:
 * выбрать можно ровно один способ, стрелки клавиатуры работают нативно.
 *
 * Онлайн-метод бэкенду НЕ передаётся — в `CreateDonationDto` его нет,
 * способ выбирают на странице Robokassa. «Расчётный счёт» меняет `channel`
 * и уводит на реквизиты. TODO(api): передать метод, когда DTO его примет.
 */
export function PaymentMethods({ value, onChange }: Props) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className="sr-only">{DONATION_FORM.methodLegend}</legend>
      <div className={styles.grid}>
        {DONATION_FORM.methods.map((option) => (
          <label
            className={option.isWide ? `${styles.tile} ${styles.wide}` : styles.tile}
            key={option.id}
          >
            <input
              className="sr-only"
              type="radio"
              name="payment-option"
              value={option.id}
              checked={value === option.id}
              onChange={() => {
                onChange(option.id);
              }}
            />
            <span className={styles.icon}>
              <PaymentIcon option={option.id} />
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{option.label}</span>
              {option.hint === null ? null : <span className={styles.hint}>{option.hint}</span>}
            </span>
            <span className={styles.check} aria-hidden="true">
              <CheckMarkIcon className={styles.checkMark} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
