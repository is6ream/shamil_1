import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

import { Trim, TrimToNull } from '../../common/dto-transforms';

const URL_MAX_LENGTH = 500;
const TITLE_MAX_LENGTH = 200;
const MAX_SORT_ORDER = 1_000_000;

export class CreateVideoDto {
  /** Ссылка на ролик VK Видео, Rutube или YouTube — как её скопировали из браузера. */
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(URL_MAX_LENGTH)
  url!: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string | null;

  /** Постер из медиатеки, показывается до клика по видео. */
  @IsOptional()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsUUID()
  posterMediaId?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}

export class UpdateVideoDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(URL_MAX_LENGTH)
  url?: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsUUID()
  posterMediaId?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number;
}
