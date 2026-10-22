import styles from "./Segmented.module.css";

export interface SegmentOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

interface Props<T extends string | number> {
  /** Подпись группы для скринридера: «Период», «Сколько месяцев показать». */
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  /** `null` — ничего не выбрано (период не задан). */
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}

/**
 * Переключатель из нескольких кнопок. Кнопки с `aria-pressed`, а не radio:
 * выбор применяется сразу, как у кнопки, а не по «Показать».
 */
export function Segmented<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
