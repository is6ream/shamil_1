import { Transform, Type } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AttributionDto } from '../attribution/dto/attribution.dto';
import { MAX_DONATION_KOPECKS, MIN_DONATION_KOPECKS } from '../config/constants';
import type { RecurringFrequency } from './contract';

export class RequestEmailCodeDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    typeof obj.email === 'string' ? obj.email.trim() : obj.email)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class VerifyEmailCodeDto {
  @IsUUID('4')
  challengeId!: string;

  @Matches(/^[0-9]{6}$/)
  code!: string;
}

export class RecurringCheckoutDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.amountKopecks)
  @IsInt()
  @Min(MIN_DONATION_KOPECKS)
  @Max(MAX_DONATION_KOPECKS)
  amountKopecks!: number;

  @IsIn(['daily', 'every_friday', 'monthly'])
  frequency!: RecurringFrequency;

  @Equals('card')
  method!: 'card';

  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.accepted)
  @Equals(true)
  accepted!: true;

  @IsString()
  @MaxLength(100)
  version!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  previewDate!: string;

  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.isAnonymous)
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  donorName?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AttributionDto)
  attribution?: AttributionDto;
}

export class CheckoutHeadersDto {
  @IsUUID('4')
  idempotencyKey!: string;
}

export class ClaimLegacyDto {
  @Matches(/^[0-9a-f]{64}$/)
  legacyKey!: string;
}
