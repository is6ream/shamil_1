import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { SubscriptionStatus } from '../../generated/prisma/enums';
import { SUBSCRIPTION_MAX_KOPECKS, SUBSCRIPTION_MIN_KOPECKS } from '../subscriptions.constants';

const REGION_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Сумма — число копеек, как у разового доната (`CreateDonationDto`):
 * 100 ₽ – 10 000 000 ₽ укладываются в безопасный диапазон number.
 */
export class CreateSubscriptionDto {
  @ApiProperty({ example: 50_000, description: 'Копейки в месяц: 100 ₽ – 10 000 000 ₽' })
  @IsInt()
  @Min(Number(SUBSCRIPTION_MIN_KOPECKS))
  @Max(Number(SUBSCRIPTION_MAX_KOPECKS))
  amountKopecks!: number;

  @ApiPropertyOptional({ example: '02', description: 'Регион «Откуда вы?» — автосписания идут в его рейтинг' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(REGION_SLUG_PATTERN)
  regionSlug?: string;

  /**
   * Явное согласие на автосписания. Только `true`: галочка по умолчанию
   * или её отсутствие — не согласие. Время и IP сохраняются в подписке.
   */
  @ApiProperty({ example: true })
  @Equals(true, { message: 'recurringConsent — нужно явное согласие на ежемесячные списания' })
  recurringConsent!: boolean;
}

export class CreatedSubscriptionResponse {
  @ApiProperty() readonly subscriptionId!: string;
  @ApiProperty({ description: 'uuid первого платежа — для страницы «спасибо»' }) readonly orderId!: string;
  @ApiProperty({ description: 'Куда отправить браузер для первого платежа' }) readonly redirectUrl!: string;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ example: 100_000 })
  @IsOptional()
  @IsInt()
  @Min(Number(SUBSCRIPTION_MIN_KOPECKS))
  @Max(Number(SUBSCRIPTION_MAX_KOPECKS))
  amountKopecks?: number;

  /** `true` — пауза, `false` — возобновить. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}

export class CancelByLinkDto {
  @ApiProperty({ description: 'Токен из ссылки в письме' })
  @IsString()
  @MaxLength(128)
  token!: string;
}

export class SubscriptionResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty({ enum: SubscriptionStatus }) readonly status!: SubscriptionStatus;
  @ApiProperty({ description: 'Копейки строкой' }) readonly amountKopecks!: string;
  @ApiPropertyOptional({ nullable: true }) readonly regionSlug!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly regionName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly nextChargeAt!: string | null;
  @ApiProperty() readonly failCount!: number;
  @ApiPropertyOptional({ nullable: true }) readonly lastFailureReason!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly lastFailedAt!: string | null;
  @ApiProperty() readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly cancelledAt!: string | null;
}
