import { CheckMarkIcon } from "@/components/icons/Icons";
import { DONATION_FORM } from "@/lib/content";
import { formatCount } from "@/lib/format";

import styles from "./ChoiceGrid.module.css";

interface Props {
  readonly presets: readonly number[];
  readonly selectedPreset: number | null;
  readonly onSelect: (rubles: number) => void;
}

export function AmountPresets({ presets, selectedPreset, onSelect }: Props) {
  if (presets.length === 0) return null;
  return (
    <fieldset className={styles.fieldset}>
      <legend className="sr-only">{DONATION_FORM.presetsLegend}</legend>
      <div className={styles.chips}>
        {presets.map((preset) => (
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
            <CheckMarkIcon className={styles.check} />
            {formatCount(preset)} ₽
          </label>
        ))}
      </div>
    </fieldset>
  );
}
