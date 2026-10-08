import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { TrimToNull } from '../../common/dto-transforms';

export const ALT_TEXT_MAX_LENGTH = 300;

/** Поля multipart рядом с файлом. */
export class UploadMediaDto {
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(ALT_TEXT_MAX_LENGTH)
  altText?: string | null;
}

export class UpdateMediaDto {
  /** Описание картинки для незрячих и поисковиков. `null` или пустая строка — стереть. */
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(ALT_TEXT_MAX_LENGTH)
  altText!: string | null;
}
