import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { KOPECKS_STRING_MESSAGE, KOPECKS_STRING_PATTERN } from '../../common/kopecks';
import { PageQueryDto } from '../../common/pagination';
import { DonationStatus } from '../../generated/prisma/enums';

export const DONATION_SORT_FIELDS = ['createdAt', 'paidAt', 'amount'] as const;
export type DonationSortField = (typeof DONATION_SORT_FIELDS)[number];

export const DATE_FIELDS = ['created', 'paid'] as const;
export type DonationDateField = (typeof DATE_FIELDS)[number];

// Управляющие символы в метке как раз и отсекаем.
// eslint-disable-next-line no-control-regex
const UTM_VALUE = /^[^\u0000-\u001f]{1,128}$/;

/**
 * Фильтры списка пожертвований (они же — для CSV). Все необязательны.
 * Период — по дате создания заказа или по дате оплаты (`dateField`).
 */
export class DonationFiltersDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(DonationStatus)
  status?: DonationStatus;

  /** Начало периода включительно, ISO-8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Конец периода не включительно, ISO-8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(DATE_FIELDS)
  dateField: DonationDateField = 'created';

  /** Способ: `sbp`, `card`, `bank_transfer`, `cash`… */
  @IsOptional()
  @Matches(/^[a-z_]{1,32}$/, { message: 'method — латиница в нижнем регистре и _' })
  method?: string;

  /** Провайдер: `manual`, `robokassa`. */
  @IsOptional()
  @Matches(/^[a-z_]{1,32}$/, { message: 'provider — латиница в нижнем регистре и _' })
  provider?: string;

  /** Сумма от, копейки строкой. Сравнивается фактически оплаченная, а у неоплаченных — сумма заказа. */
  @IsOptional()
  @Matches(KOPECKS_STRING_PATTERN, { message: `minKopecks — ${KOPECKS_STRING_MESSAGE}` })
  minKopecks?: string;

  @IsOptional()
  @Matches(KOPECKS_STRING_PATTERN, { message: `maxKopecks — ${KOPECKS_STRING_MESSAGE}` })
  maxKopecks?: string;

  @IsOptional()
  @Matches(UTM_VALUE)
  utmSource?: string;

  @IsOptional()
  @Matches(UTM_VALUE)
  utmMedium?: string;

  @IsOptional()
  @Matches(UTM_VALUE)
  utmCampaign?: string;

  /** Слаг региона: `02`, `kz`. */
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,32}$/)
  regionSlug?: string;

  /**
   * Поиск: номер счёта (цифры) или подпись донатера. Ролям с доступом к ПДн —
   * ещё и имя для сверки и телефон. Редактору поиск по ПДн недоступен.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(DONATION_SORT_FIELDS)
  sort: DonationSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
