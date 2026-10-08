import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { Trim, TrimToNull } from '../../common/dto-transforms';
import { PageQueryDto } from '../../common/pagination';
import { NewsStatus } from '../../generated/prisma/enums';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../slug';

const notNull = (_dto: unknown, value: unknown): boolean => value !== null;

/** Текст новости — до 100 тысяч символов: отчёт с таблицей расходов влезает с запасом. */
export const NEWS_BODY_MAX_LENGTH = 100_000;

export class CreateNewsDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** Не передан — строится из заголовка транслитом. */
  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug — латиница в нижнем регистре, цифры и дефисы' })
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  excerpt?: string | null;

  /** Markdown без HTML; проверяется ещё и на опасные ссылки. */
  @IsString()
  @MinLength(1)
  @MaxLength(NEWS_BODY_MAX_LENGTH)
  bodyMarkdown!: string;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID()
  coverMediaId?: string | null;

  /** По умолчанию — черновик. */
  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;
}

export class UpdateNewsDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Matches(SLUG_PATTERN, { message: 'slug — латиница в нижнем регистре, цифры и дефисы' })
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  excerpt?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(NEWS_BODY_MAX_LENGTH)
  bodyMarkdown?: string;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID()
  coverMediaId?: string | null;

  /** `published` — опубликовать (дата ставится при первой публикации), `draft` — снять с сайта. */
  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;
}

export class AdminNewsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;
}

/** Публичный список: только постраничность. */
export class PublicNewsQueryDto extends PageQueryDto {}
