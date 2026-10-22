import { DONATION_FORM } from "@/lib/content";
import { formatCount } from "@/lib/format";

import styles from "./ChoiceGrid.module.css";
import { AMOUNT_PRESETS_RUBLES } from "./donation-form.model";

interface Props {
  readonly selectedPreset: number | null;
  readonly onSelect: (rubles: number) => void;
}

/**
 * Пилюли быстрого выбора суммы внутри поля суммы. Ручной ввод сам снимает
 * подсветку: выбранным считается пресет, совпадающий с введённой суммой.
 */
export function AmountPresets({ selectedPreset, onSelect }: Props) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className="sr-only">{DONATION_FORM.presetsLegend}</legend>
      <div className={styles.chips}>
        {AMOUNT_PRESETS_RUBLES.map((preset) => (
          <label className={styles.chip} key={preset}>
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
