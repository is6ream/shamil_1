import { IsEnum, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

import { PageQueryDto } from '../../common/pagination';
import { Trim, TrimToNull } from '../../common/dto-transforms';
import { FundraisingGoalStatus } from '../../generated/prisma/enums';
import { GOAL_DESCRIPTION_MAX_LENGTH, GOAL_TITLE_MAX_LENGTH, GOAL_TITLE_MIN_LENGTH } from '../fundraising-goals.constants';

/**
 * Без угловых скобок: название и описание уходят на главную текстом, но
 * разметке в них взяться неоткуда — запрет дешевле, чем разбор, где она опасна.
 */
const NO_HTML = /^[^<>]*$/;
const NO_HTML_MESSAGE = 'HTML-разметка не допускается';

/** Цель — положительное целое число копеек строкой; диапазон проверяет сервис. */
const POSITIVE_KOPECKS = /^[1-9][0-9]{0,13}$/;

/** Корректировка — целое число копеек строкой, можно со знаком минус. */
const SIGNED_KOPECKS = /^(0|-?[1-9][0-9]{0,13})$/;

const ISO_DATE_TIME = { strict: true, strictSeparator: true } as const;

/** Поле передано — тогда оно обязано быть валидным; `null` для него не «стереть». */
const isPresent = (field: string) => (object: object) => (object as Record<string, unknown>)[field] !== undefined;

export class CreateGoalDto {
  @Trim()
  @IsString()
  @Length(GOAL_TITLE_MIN_LENGTH, GOAL_TITLE_MAX_LENGTH, { message: `title — от ${GOAL_TITLE_MIN_LENGTH} до ${GOAL_TITLE_MAX_LENGTH} символов` })
  @Matches(NO_HTML, { message: `title: ${NO_HTML_MESSAGE}` })
  title!: string;

  /** Пустая строка — «без описания». */
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(GOAL_DESCRIPTION_MAX_LENGTH, { message: `description — не длиннее ${GOAL_DESCRIPTION_MAX_LENGTH} символов` })
  @Matches(NO_HTML, { message: `description: ${NO_HTML_MESSAGE}` })
  description?: string | null;

  /** Копейки строкой: 700 000 ₽ = "70000000". */
  @Matches(POSITIVE_KOPECKS, { message: 'targetAmountKopecks — положительное целое число копеек строкой' })
  targetAmountKopecks!: string;

  /** ISO 8601 с часовым поясом. Не передано — с момента создания. */
  @IsOptional()
  @IsISO8601(ISO_DATE_TIME, { message: 'startsAt — дата и время ISO 8601' })
  startsAt?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE_TIME, { message: 'endsAt — дата и время ISO 8601 или null' })
  endsAt?: string | null;

  @IsOptional()
  @Matches(SIGNED_KOPECKS, { message: 'manualAdjustmentKopecks — целое число копеек строкой' })
  manualAdjustmentKopecks?: string;
}

/** Частичная правка. `description: null` и `endsAt: null` — стереть; остальным полям null нельзя. */
export class UpdateGoalDto {
  @ValidateIf(isPresent('title'))
  @Trim()
  @IsString()
  @Length(GOAL_TITLE_MIN_LENGTH, GOAL_TITLE_MAX_LENGTH, { message: `title — от ${GOAL_TITLE_MIN_LENGTH} до ${GOAL_TITLE_MAX_LENGTH} символов` })
  @Matches(NO_HTML, { message: `title: ${NO_HTML_MESSAGE}` })
  title?: string;

  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(GOAL_DESCRIPTION_MAX_LENGTH, { message: `description — не длиннее ${GOAL_DESCRIPTION_MAX_LENGTH} символов` })
  @Matches(NO_HTML, { message: `description: ${NO_HTML_MESSAGE}` })
  description?: string | null;

  @ValidateIf(isPresent('targetAmountKopecks'))
  @Matches(POSITIVE_KOPECKS, { message: 'targetAmountKopecks — положительное целое число копеек строкой' })
  targetAmountKopecks?: string;

  @ValidateIf(isPresent('startsAt'))
  @IsISO8601(ISO_DATE_TIME, { message: 'startsAt — дата и время ISO 8601' })
  startsAt?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE_TIME, { message: 'endsAt — дата и время ISO 8601 или null' })
  endsAt?: string | null;

  @ValidateIf(isPresent('manualAdjustmentKopecks'))
  @Matches(SIGNED_KOPECKS, { message: 'manualAdjustmentKopecks — целое число копеек строкой' })
  manualAdjustmentKopecks?: string;
}

export class GoalListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(FundraisingGoalStatus, { message: 'status — ACTIVE, DRAFT, COMPLETED или ARCHIVED' })
  status?: FundraisingGoalStatus;
}
