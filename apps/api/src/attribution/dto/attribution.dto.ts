import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  ATTRIBUTION_URL_MAX_LENGTH,
  LANDING_PAGE_PATTERN,
  UTM_MESSAGE,
  UTM_VALUE_MAX_LENGTH,
  UTM_VALUE_PATTERN,
} from '../attribution.constants';

/**
 * Нормализация метки до валидации: края обрезаются, регистр — нижний.
 * Иначе `Telegram`, `telegram` и `telegram ` — три строки отчёта вместо одной.
 * Пустая строка — «метки не было», то есть `undefined`, а не `""` в базе.
 * Не строка проходит как есть: её отклонит `@IsString()`.
 */
export function normalizeUtmValue({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length === 0 ? undefined : normalized;
}

/** Обрезка краёв без смены регистра: путь и Referer регистрозависимы. */
function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

/** Поле UTM-метки: необязательное, нормализованное, закрытый набор символов. */
export const UtmField = (): PropertyDecorator =>
  applyDecorators(
    Transform(normalizeUtmValue),
    IsOptional(),
    IsString(),
    MaxLength(UTM_VALUE_MAX_LENGTH),
    Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE }),
  );

/** Внешний Referer первого захода — только http(s). */
export const ReferrerField = (): PropertyDecorator =>
  applyDecorators(
    Transform(trimToUndefined),
    IsOptional(),
    IsString(),
    MaxLength(ATTRIBUTION_URL_MAX_LENGTH),
    IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }),
  );

/** Путь страницы первого захода. Домена нет: он всегда наш. */
export const LandingPageField = (): PropertyDecorator =>
  applyDecorators(
    Transform(trimToUndefined),
    IsOptional(),
    IsString(),
    MaxLength(ATTRIBUTION_URL_MAX_LENGTH),
    Matches(LANDING_PAGE_PATTERN, { message: 'landingPage — путь, начинающийся с /' }),
  );

/** Метки одного касания: первого захода или последнего захода с UTM. */
export class UtmTouchDto {
  @UtmField()
  source?: string;

  @UtmField()
  medium?: string;

  @UtmField()
  campaign?: string;

  @UtmField()
  content?: string;

  @UtmField()
  term?: string;
}

/**
 * Атрибуция доната: first-touch и last-touch из cookie сайта.
 *
 * Все поля необязательны: донат без атрибуции проходит так же, как без региона —
 * это статистика, а не условие оплаты. Источник по Referer здесь не передаётся:
 * классифицирует его бэкенд (`AttributionService`), фронт шлёт сырой Referer.
 */
export class AttributionDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UtmTouchDto)
  first?: UtmTouchDto;

  /** Последний заход с метками. Не передан — last-touch совпадает с first-touch. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UtmTouchDto)
  last?: UtmTouchDto;

  @ReferrerField()
  referrer?: string;

  @LandingPageField()
  landingPage?: string;

  /** Время первого захода, ISO-8601. Сервер отбрасывает будущее и старше окна атрибуции. */
  @IsOptional()
  @IsISO8601({ strict: true })
  firstTouchAt?: string;
}
