import { Transform } from 'class-transformer';
import { IsArray, ArrayMaxSize, ArrayUnique, IsUUID } from 'class-validator';

/**
 * Общие преобразования полей DTO админки. Строки обрезаются по краям,
 * пустая строка в необязательном поле значит «стереть» — то есть `null`.
 */
export function trimToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

export function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export const TrimToNull = (): PropertyDecorator => Transform(trimToNull);

export const Trim = (): PropertyDecorator => Transform(trim);

/** Дата без времени: `2026-06-15`. */
export const DATE_ONLY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Порядок элементов списка: id в нужной последовательности. */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

/** `2026-06-15` → Date в полночь UTC: колонка `date`, времени в ней нет. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
