import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { DATE_ONLY_PATTERN, TrimToNull } from '../../common/dto-transforms';

const CAPTION_MAX_LENGTH = 300;
const ALT_MAX_LENGTH = 200;
const MAX_SORT_ORDER = 1_000_000;

export class CreateGalleryItemDto {
  @IsUUID()
  mediaAssetId!: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(CAPTION_MAX_LENGTH)
  caption?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(ALT_MAX_LENGTH)
  altText?: string | null;

  /** Дата съёмки `ГГГГ-ММ-ДД` — по ней подпись «июнь 2026». */
  @IsOptional()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @Matches(DATE_ONLY_PATTERN, { message: 'takenOn — дата в формате ГГГГ-ММ-ДД' })
  takenOn?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}

export class UpdateGalleryItemDto {
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(CAPTION_MAX_LENGTH)
  caption?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(ALT_MAX_LENGTH)
  altText?: string | null;

  @IsOptional()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @Matches(DATE_ONLY_PATTERN, { message: 'takenOn — дата в формате ГГГГ-ММ-ДД' })
  takenOn?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}
