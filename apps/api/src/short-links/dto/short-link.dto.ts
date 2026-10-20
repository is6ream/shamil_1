import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import {
  UTM_MESSAGE,
  UTM_VALUE_MAX_LENGTH,
  UTM_VALUE_PATTERN,
} from '../../attribution/attribution.constants';
import { Trim } from '../../common/dto-transforms';
import {
  SHORT_LINK_SLUG_MAX_LENGTH,
  SHORT_LINK_SLUG_PATTERN,
  SHORT_LINK_TARGET_PATH_MAX_LENGTH,
  SHORT_LINK_TARGET_PATH_PATTERN,
  SHORT_LINK_TITLE_MAX_LENGTH,
} from '../short-links.constants';

/**
 * Метка короткой ссылки нормализуется так же, как метка доната: края обрезаны,
 * регистр нижний. Иначе клик по `Telegram` и донат с `telegram` разъедутся.
 * Пустая строка — `null`: в правке это «стереть метку».
 */
function normalizeUtmOrNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length === 0 ? null : normalized;
}

/** Источник обязателен и не стирается: пустая строка остаётся строкой и не пройдёт `@IsNotEmpty()`. */
function normalizeUtm({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

const OptionalUtmField = (): PropertyDecorator =>
  applyDecorators(
    Transform(normalizeUtmOrNull),
    IsOptional(),
    IsString(),
    MaxLength(UTM_VALUE_MAX_LENGTH),
    Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE }),
  );

const SlugMessage = 'slug — строчные латиница и цифры, дефис между ними';
const TargetPathMessage = 'targetPath — путь на сайте: /, /02/, /novosti/ — без домена и query';

export class CreateShortLinkDto {
  @Trim()
  @IsString()
  @MaxLength(SHORT_LINK_SLUG_MAX_LENGTH)
  @Matches(SHORT_LINK_SLUG_PATTERN, { message: SlugMessage })
  slug!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHORT_LINK_TITLE_MAX_LENGTH)
  title!: string;

  /** Не передан — главная. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_LINK_TARGET_PATH_MAX_LENGTH)
  @Matches(SHORT_LINK_TARGET_PATH_PATTERN, { message: TargetPathMessage })
  targetPath?: string;

  /** Источник обязателен: ради метки короткую ссылку и заводят. */
  @Transform(normalizeUtm)
  @IsString()
  @IsNotEmpty()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  utmSource!: string;

  @OptionalUtmField()
  utmMedium?: string | null;

  @OptionalUtmField()
  utmCampaign?: string | null;

  @OptionalUtmField()
  utmContent?: string | null;

  @OptionalUtmField()
  utmTerm?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Правка ссылки. Слага здесь нет намеренно: он уже напечатан в QR,
 * и смена слага молча увела бы все баннеры на главную.
 */
export class UpdateShortLinkDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHORT_LINK_TITLE_MAX_LENGTH)
  title?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_LINK_TARGET_PATH_MAX_LENGTH)
  @Matches(SHORT_LINK_TARGET_PATH_PATTERN, { message: TargetPathMessage })
  targetPath?: string;

  @Transform(normalizeUtm)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  utmSource?: string;

  @OptionalUtmField()
  utmMedium?: string | null;

  @OptionalUtmField()
  utmCampaign?: string | null;

  @OptionalUtmField()
  utmContent?: string | null;

  @OptionalUtmField()
  utmTerm?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
