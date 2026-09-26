import field from "@/components/ui/field.module.css";
import { DONATION_FORM } from "@/lib/content";
import { formatCount } from "@/lib/format";

import styles from "./ChoiceGrid.module.css";
import { AMOUNT_PRESETS_RUBLES } from "./donation-form.model";

interface Props {
  readonly selectedPreset: number | null;
  readonly onSelect: (rubles: number) => void;
}

/**
 * Пресеты сумм. У референса их нет вообще, только ручной ввод, — и это
 * упущение: пресет снимает вопрос «сколько принято жертвовать».
 *
 * Своя сумма — отдельное поле под пресетами (макет v2), поэтому пятой
 * кнопки «Своя сумма» больше нет: ручной ввод сам снимает подсветку.
 */
export function AmountPresets({ selectedPreset, onSelect }: Props) {
  return (
    <fieldset className={field.fieldset}>
      <legend className={field.legend}>{DONATION_FORM.amountLegend}</legend>
      <div className={styles.grid}>
        {AMOUNT_PRESETS_RUBLES.map((preset) => (
          <label className={styles.choice} key={preset}>
            <input
              className="sr-only"
              type="radio"
              name="amount-preset"
              value={preset}
              checked={selectedPreset === preset}
              onChange={() => {
                onSelect(preset);
              }}
            />
            {formatCount(preset)} ₽
          </label>
        ))}
      </div>
    </fieldset>
  );
}
