import { formatCount } from "@/lib/format";

import { AMOUNT_PRESETS_RUBLES } from "./donation-form.model";

interface Props {
  readonly selectedPreset: number | null;
  readonly onSelect: (rubles: number) => void;
  readonly onCustom: () => void;
}

/**
 * Пресеты сумм. У референса их нет вообще, только ручной ввод, — и это
 * упущение: пресет снимает вопрос «сколько принято жертвовать».
 *
 * Это настоящие `input[type=radio]` внутри `<label>`, а не div-ы с классом:
 * иначе форма непроходима с клавиатуры, а скринридер не объявляет выбранную
 * сумму. На форме, через которую идут деньги, это не косметика.
 */
export function AmountPresets({ selectedPreset, onSelect, onCustom }: Props) {
  return (
    <fieldset className="fieldset-plain">
      <legend className="field-label">Сумма пожертвования</legend>
      <div className="chips">
        {AMOUNT_PRESETS_RUBLES.map((preset) => (
          <label className="chip" key={preset}>
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

        <label className="chip">
          <input
            className="sr-only"
            type="radio"
            name="amount-preset"
            value="custom"
            checked={selectedPreset === null}
            onChange={onCustom}
          />
          Своя сумма
        </label>
      </div>
    </fieldset>
  );
}
