import { ArrowRightIcon, CheckMarkIcon } from "@/components/icons/Icons";
import { DONATION_FORM } from "@/lib/content";

import type { PaymentOptionId } from "./donation-form.model";
import { PaymentIcon } from "./PaymentIcons";
import styles from "./PaymentMethods.module.css";

interface Props {
  readonly value: PaymentOptionId | null;
  readonly available: readonly PaymentOptionId[];
  readonly onChange: (option: PaymentOptionId) => void;
}

export function PaymentMethods({ value, available, onChange }: Props) {
  const options = DONATION_FORM.methods.filter(option => available.includes(option.id));
  if (options.length === 0) return null;
  const columns = Math.max(1, options.filter(option => !option.isWide).length);
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{DONATION_FORM.methodLegend}</legend>
      <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <label
            className={option.isWide || options.length === 1 ? `${styles.tile} ${styles.wide}` : styles.tile}
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
              {option.hint === null ? null : (
                <span className={styles.hint}>{option.hint}</span>
              )}
            </span>
            {option.isWide && <ArrowRightIcon className={styles.arrow} />}
            <span className={styles.check} aria-hidden="true">
              <CheckMarkIcon className={styles.checkMark} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
