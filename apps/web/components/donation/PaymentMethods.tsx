import field from "@/components/ui/field.module.css";
import { DONATION_FORM } from "@/lib/content";

import styles from "./ChoiceGrid.module.css";
import type { OnlineMethodId } from "./donation-form.model";

interface Props {
  readonly value: OnlineMethodId;
  readonly onChange: (method: OnlineMethodId) => void;
}

/**
 * Способы оплаты. СБП стоит первым и выбран по умолчанию: нулевая комиссия
 * для плательщика и оплата в два тапа, в ленте референса он лидирует.
 *
 * Выбранный способ бэкенду НЕ передаётся — в `CreateDonationDto` поля метода
 * нет, а СБП, SberPay, T-Pay и карта — способы внутри Robokassa, их выбирают
 * на её странице. Кнопки отвечают на вопрос «а чем можно заплатить»
 * до перехода. TODO(api): передать способ, когда DTO его примет.
 */
export function PaymentMethods({ value, onChange }: Props) {
  return (
    <fieldset className={field.fieldset}>
      <legend className={field.legend}>{DONATION_FORM.methodLegend}</legend>
      <div className={styles.grid}>
        {DONATION_FORM.methods.map((method) => (
          <label className={styles.choice} key={method.id}>
            <input
              className="sr-only"
              type="radio"
              name="online-method"
              value={method.id}
              checked={value === method.id}
              onChange={() => {
                onChange(method.id);
              }}
            />
            {method.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
