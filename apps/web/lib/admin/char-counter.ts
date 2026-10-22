/** С этой доли лимита счётчик подсвечивается: пора сокращать. */
const NEAR_LIMIT = 0.9;

export interface CharCounter {
  /** «9 / 160». */
  readonly text: string;
  readonly isNear: boolean;
}

/**
 * Счётчик символов под полем с ограничением длины. Считает `length` —
 * в тех же единицах UTF-16, в которых браузер применяет `maxLength`:
 * иначе счётчик показывал бы запас, которого у поля уже нет.
 */
export function charCounter(value: string, max: number | undefined): CharCounter | null {
  if (max === undefined || !Number.isFinite(max) || max <= 0) {
    return null;
  }

  return { text: `${value.length} / ${max}`, isNear: value.length >= max * NEAR_LIMIT };
}
