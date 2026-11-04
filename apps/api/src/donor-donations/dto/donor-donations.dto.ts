import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { DonationStatus, DonationType, TaxCertificateStatus } from '../../generated/prisma/enums';

export const MIN_REPORT_YEAR = 2020;
export const MAX_REPORT_YEAR = 2100;
export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 50;

export class DonorHistoryQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Календарный год; по умолчанию текущий' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_REPORT_YEAR)
  @Max(MAX_REPORT_YEAR)
  year?: number;

  @ApiPropertyOptional({ description: '`nextCursor` предыдущей страницы' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'cursor — значение nextCursor из прошлого ответа' })
  cursor?: string;

  @ApiPropertyOptional({ default: DEFAULT_HISTORY_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit: number = DEFAULT_HISTORY_LIMIT;
}

export class DonorHistoryItem {
  @ApiProperty() readonly id!: string;
  @ApiProperty({ description: 'Когда начато: группировка по дням и время в строке' }) readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly paidAt!: string | null;
  @ApiProperty({ description: 'Копейки строкой: оплаченная сумма, а у неуспешных — назначенная' })
  readonly amountKopecks!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Код способа: sbp, card, bank_transfer…' })
  readonly method!: string | null;
  @ApiProperty({ enum: ['ONE_TIME', 'RECURRING'] }) readonly kind!: 'ONE_TIME' | 'RECURRING';
  @ApiProperty({ enum: [DonationStatus.paid, DonationStatus.failed] }) readonly status!: DonationStatus;
}

export class DonorHistoryResponse {
  @ApiProperty() readonly year!: number;
  @ApiProperty({ description: 'Успешные за год, копейки строкой' }) readonly yearTotalKopecks!: string;
  @ApiProperty({ type: [Number], description: 'Годы для фильтра: от первого пожертвования до текущего' })
  readonly years!: readonly number[];
  @ApiProperty({ type: [DonorHistoryItem] }) readonly items!: readonly DonorHistoryItem[];
  @ApiPropertyOptional({ nullable: true }) readonly nextCursor!: string | null;
}

export class CreateTaxCertificateDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_REPORT_YEAR)
  @Max(MAX_REPORT_YEAR)
  year!: number;
}

export class TaxCertificateResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly year!: number;
  @ApiProperty({ enum: TaxCertificateStatus }) readonly status!: TaxCertificateStatus;
  @ApiPropertyOptional({ nullable: true }) readonly adminComment!: string | null;
  @ApiProperty() readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly doneAt!: string | null;
}

/** Для типа строки истории: CHILD и PARENT — оба «Автоплатёж». */
export function kindOf(type: DonationType): 'ONE_TIME' | 'RECURRING' {
  return type === DonationType.ONE_TIME ? 'ONE_TIME' : 'RECURRING';
}
