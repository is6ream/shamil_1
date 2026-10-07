import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

/** Длина значения метки — `VarChar(128)` в `donation.utm_*`. */
export const UTM_VALUE_MAX_LENGTH = 128;

/** `VarChar(512)` у `referrer` и `landing_page`. */
export const ATTRIBUTION_URL_MAX_LENGTH = 512;

/**
 * Допустимые символы метки: буквы любого алфавита (кампании пишут и по-русски),
 * цифры и то, что встречается в метках рекламных кабинетов. Ни угловых скобок,
 * ни кавычек: значения показываются в админке и уходят в CSV.
 *
 * Зеркало `UTM_VALUE_PATTERN` во фронтенде (`apps/web/lib/attribution.ts`) —
 * фронт отбрасывает неподходящее значение сам, чтобы метка не сорвала донат.
 */
export const UTM_VALUE_PATTERN = /^[\p{L}\p{N} _\-.~+%:@/|]+$/u;

/** Путь без домена: `/`, `/02/`, `/?utm_source=vk`. Пробелы и управляющие символы недопустимы. */
export const LANDING_PAGE_PATTERN = /^\/[^\s<>"']*$/;

const UTM_MESSAGE = 'UTM-метка: до 128 символов — буквы, цифры, пробел и _ - . ~ + % : @ / |';

/**
 * Атрибуция first-touch из cookie первого захода. Все поля необязательны:
 * донат без меток обязан проходить, атрибуция — статистика, а не условие оплаты.
 */
export class DonationUtmDto {
  @IsOptional()
  @IsString()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(UTM_VALUE_MAX_LENGTH)
  @Matches(UTM_VALUE_PATTERN, { message: UTM_MESSAGE })
  term?: string;

  /** Внешний Referer первого захода — только http(s). */
  @IsOptional()
  @IsString()
  @MaxLength(ATTRIBUTION_URL_MAX_LENGTH)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  referrer?: string;

  /** Путь страницы первого захода. Домена нет: он всегда наш. */
  @IsOptional()
  @IsString()
  @MaxLength(ATTRIBUTION_URL_MAX_LENGTH)
  @Matches(LANDING_PAGE_PATTERN, { message: 'landingPage — путь, начинающийся с /' })
  landingPage?: string;
}
