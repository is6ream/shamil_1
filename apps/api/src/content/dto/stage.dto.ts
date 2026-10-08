import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { KOPECKS_STRING_MESSAGE, KOPECKS_STRING_PATTERN } from '../../common/kopecks';
import { Trim, TrimToNull } from '../../common/dto-transforms';
import { ConstructionStageStatus } from '../../generated/prisma/enums';

const notNull = (_dto: unknown, value: unknown): boolean => value !== null;
const MAX_SORT_ORDER = 1_000_000;
const MAX_PHOTOS = 30;

export class CreateStageDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ConstructionStageStatus)
  status?: ConstructionStageStatus;

  /** Смета этапа, копейки строкой. `null` — не названа. */
  @IsOptional()
  @ValidateIf(notNull)
  @Matches(KOPECKS_STRING_PATTERN, { message: `budgetKopecks — ${KOPECKS_STRING_MESSAGE}` })
  budgetKopecks?: string | null;

  /** Освоено по этапу, копейки строкой. */
  @IsOptional()
  @ValidateIf(notNull)
  @Matches(KOPECKS_STRING_PATTERN, { message: `spentKopecks — ${KOPECKS_STRING_MESSAGE}` })
  spentKopecks?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  /** Фото этапа из медиатеки, в порядке показа. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoMediaIds?: string[];
}

export class UpdateStageDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ConstructionStageStatus)
  status?: ConstructionStageStatus;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(KOPECKS_STRING_PATTERN, { message: `budgetKopecks — ${KOPECKS_STRING_MESSAGE}` })
  budgetKopecks?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(KOPECKS_STRING_PATTERN, { message: `spentKopecks — ${KOPECKS_STRING_MESSAGE}` })
  spentKopecks?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;

  /** Передан — фото этапа заменяются этим списком целиком. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoMediaIds?: string[];
}
