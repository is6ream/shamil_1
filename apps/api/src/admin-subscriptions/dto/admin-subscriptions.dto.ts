import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../common/pagination';
import { SubscriptionStatus } from '../../generated/prisma/enums';

export class AdminSubscriptionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  /** Поиск по e-mail — только для ролей с доступом к ПДн. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(254)
  email?: string;
}

export class AdminSubscriptionResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty({ enum: SubscriptionStatus }) readonly status!: SubscriptionStatus;
  @ApiProperty() readonly amountKopecks!: string;
  @ApiProperty({ description: 'Полный адрес — только SUPER_ADMIN и ACCOUNTANT, остальным маска' })
  readonly donorEmail!: string;
  @ApiPropertyOptional({ nullable: true }) readonly regionName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly nextChargeAt!: string | null;
  @ApiProperty() readonly failCount!: number;
  @ApiPropertyOptional({ nullable: true }) readonly lastFailureReason!: string | null;
  @ApiProperty({ description: 'Успешных платежей (первый + автосписания)' }) readonly paidCount!: number;
  @ApiProperty() readonly paidTotalKopecks!: string;
  @ApiProperty() readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly cancelledAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly cancelSource!: string | null;
}

export class MonthlyChargeStats {
  @ApiProperty({ example: '2026-10' }) readonly month!: string;
  @ApiProperty() readonly paid!: number;
  @ApiProperty() readonly failed!: number;
}

export class AdminSubscriptionStatsResponse {
  @ApiProperty() readonly active!: number;
  @ApiProperty() readonly paused!: number;
  @ApiProperty() readonly pending!: number;
  @ApiProperty() readonly failed!: number;
  @ApiProperty() readonly cancelled!: number;
  @ApiProperty({ description: 'MRR: сумма активных подписок в месяц, копейки' }) readonly mrrKopecks!: string;
  @ApiProperty({ type: [MonthlyChargeStats], description: 'Автосписания за 12 месяцев, по месяцам (МСК)' })
  readonly charges!: readonly MonthlyChargeStats[];
}
