import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { Trim, TrimToNull } from '../../common/dto-transforms';
import { MANUAL_CONFIRM_METHODS } from '../../config/constants';
import type { ManualConfirmMethod } from '../../config/constants';

const notNull = (_dto: unknown, value: unknown): boolean => value !== null;

/** Положительные копейки строкой: ноль поступлением не бывает. */
const POSITIVE_KOPECKS = /^[1-9][0-9]{0,11}$/;

/**
 * Ручное поступление: наличные в ящике, перевод по выписке без заказа на сайте.
 * Донат вставляется сразу в `paid`, витрины пересчитывает триггер.
 */
export class ManualDonationDto {
  /**
   * Ключ идемпотентности — uuid, который клиент генерирует один раз на форму.
   * Повтор с тем же ключом и теми же данными — тот же донат, без второго
   * зачисления; с тем же ключом и другими данными — 409.
   */
  @IsUUID()
  idempotencyKey!: string;

  @Matches(POSITIVE_KOPECKS, { message: 'amountKopecks — положительное целое число копеек строкой' })
  amountKopecks!: string;

  @IsIn(MANUAL_CONFIRM_METHODS)
  method!: ManualConfirmMethod;

  /** Обязателен: откуда деньги («наличные, пятничный намаз»). Без ПДн. */
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  comment!: string;

  /** Когда деньги поступили. Не передано — сейчас. В будущем — нельзя. */
  @IsOptional()
  @IsISO8601({ strict: true })
  paidAt?: string;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^[a-z0-9-]{1,32}$/)
  regionSlug?: string | null;

  /** По умолчанию — анонимно, как и на сайте (блок 9 ТЗ). */
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  /** Публичная подпись в ленте; только при `isAnonymous: false`. */
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(120)
  donorName?: string | null;
}
