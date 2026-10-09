import { IsISO8601, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  /** Начало периода включительно (по дате оплаты), ISO-8601. По умолчанию — 30 дней назад. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Конец периода не включительно. По умолчанию — сейчас. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
