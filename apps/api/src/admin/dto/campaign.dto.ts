import { IsOptional, Matches } from 'class-validator';

import { DATE_ONLY_PATTERN } from '../../common/dto-transforms';

const POSITIVE_KOPECKS = /^[1-9][0-9]{0,13}$/;
const KOPECKS_MESSAGE = 'положительное целое число копеек строкой';

export class UpdateCampaignDto {
  /** Общая цель сбора, копейки строкой: 240 000 000 ₽ = "24000000000". */
  @Matches(POSITIVE_KOPECKS, { message: `goalKopecks — ${KOPECKS_MESSAGE}` })
  goalKopecks!: string;
}

/** Период — даты по Москве включительно: в той же зоне триггер раскладывает донаты по месяцам. */
export class CreateMonthlyGoalDto {
  @Matches(DATE_ONLY_PATTERN, { message: 'periodStart — дата ГГГГ-ММ-ДД' })
  periodStart!: string;

  @Matches(DATE_ONLY_PATTERN, { message: 'periodEnd — дата ГГГГ-ММ-ДД' })
  periodEnd!: string;

  @Matches(POSITIVE_KOPECKS, { message: `goalKopecks — ${KOPECKS_MESSAGE}` })
  goalKopecks!: string;
}

export class UpdateMonthlyGoalDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'periodStart — дата ГГГГ-ММ-ДД' })
  periodStart?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, { message: 'periodEnd — дата ГГГГ-ММ-ДД' })
  periodEnd?: string;

  @IsOptional()
  @Matches(POSITIVE_KOPECKS, { message: `goalKopecks — ${KOPECKS_MESSAGE}` })
  goalKopecks?: string;
}
