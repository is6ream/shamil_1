import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmpty,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  MAX_DONATION_KOPECKS,
  MIN_DONATION_KOPECKS,
  PUBLIC_REGION_SOURCES,
} from '../../config/constants';
import type { PublicRegionSource } from '../../config/constants';

/** Слаг региона: тот же формат, что и CHECK `region_slug_format` в БД. */
const REGION_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Телефон строго E.164 — зеркало CHECK `donation_contact_phone_e164`. */
const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/**
 * Тело запроса на создание доната.
 *
 * Валидация здесь — только формат. Сумму списания назначает сервер
 * (CLAUDE.md, «Поток платежа»): пришедшее число проходит проверку диапазона,
 * сверяется с минимумом сбора и дальше не используется нигде — в подпись
 * уходит значение, посчитанное на бэкенде.
 */
export class CreateDonationDto {
  /**
   * Сумма в копейках. Целое число, без плавающей точки: рубли с копейками
   * в JSON — это double, а double на деньгах сбора расходится с выпиской.
   */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_DONATION_KOPECKS)
  @Max(MAX_DONATION_KOPECKS)
  amountKopecks!: number;

  /**
   * Регион из селектора «Откуда вы?» или из региональной ссылки `/{код}/`.
   * Необязателен: донат без региона обязан проходить, платёж важнее статистики.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(REGION_SLUG_PATTERN)
  regionSlug?: string;

  /**
   * Как регион попал в форму. У референса канал был один — ссылка, и из-за
   * этого 93% донатов не попали в рейтинг. Различать каналы нужно, чтобы
   * увидеть это в своих цифрах, а не узнать постфактум.
   */
  @IsOptional()
  @IsIn(PUBLIC_REGION_SOURCES)
  regionSource?: PublicRegionSource;

  /**
   * Анонимность включена по умолчанию: садака — скрытое поклонение (блок 9 ТЗ).
   * В топ донатеров попадают только снявшие галочку сознательно.
   */
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  /** Публичная подпись для ленты и топа. У анонимного доната игнорируется. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  donorName?: string;

  /** Телефон в E.164. Хранится отдельной таблицей и не выходит в публичные API. */
  @IsOptional()
  @Matches(PHONE_E164_PATTERN)
  phone?: string;

  /** Имя для сверки поступлений по реквизитам. Это не публичная подпись. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  /**
   * Согласие на обработку ПДн. Без него строка `donation_contact` не создаётся
   * вовсе — ни телефона, ни имени в базе не появляется (152-ФЗ).
   */
  @IsOptional()
  @IsBoolean()
  personalDataConsent?: boolean;

  /**
   * Honeypot против ботов: поле скрыто в вёрстке, человек его не заполняет.
   * Приём взят у референса, стоит пять строк.
   */
  @IsEmpty()
  antispam?: string;
}
