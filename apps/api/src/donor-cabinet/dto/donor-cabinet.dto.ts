import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

import { TrimToNull } from '../../common/dto-transforms';
import { PageQueryDto } from '../../common/pagination';
import { DonationStatus, DonationType } from '../../generated/prisma/enums';

/** E.164, как CHECK `donor_user_phone_e164`. */
const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export class DonorProfileResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly email!: string;
  @ApiPropertyOptional({ nullable: true }) readonly name!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly phone!: string | null;
  @ApiProperty() readonly marketingConsent!: boolean;
  @ApiProperty() readonly createdAt!: string;
}

/** Пустая строка в имени или телефоне — «стереть» (`null`). E-mail здесь не меняется: он и есть логин. */
export class UpdateDonorProfileDto {
  @ApiPropertyOptional({ nullable: true, example: 'Ильдар' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+79171234567' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @Matches(PHONE_E164_PATTERN, { message: 'phone — номер в формате +79171234567' })
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class DonorDonationsQueryDto extends PageQueryDto {}

export class DonorDonationResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty({ enum: DonationType }) readonly type!: DonationType;
  @ApiProperty({ enum: DonationStatus }) readonly status!: DonationStatus;
  @ApiProperty({ description: 'Копейки строкой' }) readonly amountKopecks!: string;
  @ApiPropertyOptional({ nullable: true }) readonly paidAmountKopecks!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly paidAt!: string | null;
  @ApiProperty() readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly subscriptionId!: string | null;
}

export class DonorDonationsPage {
  @ApiProperty({ type: [DonorDonationResponse] }) readonly items!: readonly DonorDonationResponse[];
  @ApiProperty() readonly total!: number;
  @ApiProperty() readonly page!: number;
  @ApiProperty() readonly pageSize!: number;
}
