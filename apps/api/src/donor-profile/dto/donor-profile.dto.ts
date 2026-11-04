import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

import { TrimToNull } from '../../common/dto-transforms';
import { LOGIN_CODE_LENGTH } from '../../donor-auth/donor-auth.constants';
import { toEmail } from '../../donor-auth/dto/donor-auth.dto';

const NAME_MAX_LENGTH = 60;
const CITY_MAX_LENGTH = 120;

/** Буквы любого алфавита, пробел, дефис, апостроф: «Абдул-Азиз», «О’Коннор». */
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M} '’-]*$/u;

/** E.164, как CHECK `donor_user_phone_e164`. */
const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/** Как `regionSlug` формы доната: слаг из публичного GET /regions. */
const REGION_SLUG_PATTERN = /^[a-z0-9-]{1,32}$/;

const notNull = (_dto: unknown, value: unknown): boolean => value !== null;

export class DonorRegionView {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly slug!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: ['country', 'subject'] }) readonly type!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Страна субъекта; у страны — null' })
  readonly countryName!: string | null;
}

export class DonorProfileResponse {
  @ApiProperty() readonly id!: string;
  @ApiPropertyOptional({ nullable: true }) readonly email!: string | null;
  @ApiProperty({ description: 'Привязан вход через VK ID' }) readonly vkLinked!: boolean;
  @ApiPropertyOptional({ nullable: true }) readonly firstName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly lastName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly middleName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly phone!: string | null;
  @ApiPropertyOptional({ type: DonorRegionView, nullable: true }) readonly region!: DonorRegionView | null;
  @ApiPropertyOptional({ nullable: true }) readonly city!: string | null;
  @ApiProperty({ description: 'Согласие на показ имени и региона в ленте (ст. 10.1 152-ФЗ)' })
  readonly showInFeed!: boolean;
  @ApiProperty() readonly createdAt!: string;
}

/** Карточка профиля на каждой странице кабинета. */
export class DonorSummaryResponse {
  @ApiProperty({ description: 'Текущий календарный год в часовом поясе жертвователя' }) readonly year!: number;
  @ApiProperty({ description: 'Успешные пожертвования за этот год, копейки строкой' }) readonly yearTotalKopecks!: string;
  @ApiProperty({ description: 'Успешных пожертвований за всё время' }) readonly donationsCount!: number;
  @ApiProperty({ description: 'Дата создания кабинета' }) readonly memberSince!: string;
  @ApiProperty({ description: 'Есть действующее регулярное пожертвование' }) readonly hasActiveSubscription!: boolean;
}

/**
 * Личные данные. Пустая строка — «стереть» (`null`). E-mail здесь не
 * меняется — только кодом на новый адрес (`/donor/me/email/*`).
 */
export class UpdateDonorProfileDto {
  @ApiPropertyOptional({ nullable: true, example: 'Ильдар' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NAME_PATTERN, { message: 'firstName — только буквы, пробел и дефис' })
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Хасанов' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NAME_PATTERN, { message: 'lastName — только буквы, пробел и дефис' })
  lastName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Рамилевич' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Matches(NAME_PATTERN, { message: 'middleName — только буквы, пробел и дефис' })
  middleName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+79171234567' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @Matches(PHONE_E164_PATTERN, { message: 'phone — номер в формате +79171234567' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '02', description: 'slug страны или субъекта из GET /regions' })
  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @Matches(REGION_SLUG_PATTERN, { message: 'regionSlug — slug региона из справочника' })
  regionSlug?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Уфа' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(CITY_MAX_LENGTH)
  city?: string | null;

  @ApiPropertyOptional({ description: 'Показывать имя и регион в ленте пожертвований' })
  @IsOptional()
  @IsBoolean()
  showInFeed?: boolean;
}

export class ChangeEmailRequestDto {
  @ApiProperty({ example: 'new@example.com' })
  @Transform(toEmail)
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(254)
  email!: string;
}

export class ChangeEmailConfirmDto extends ChangeEmailRequestDto {
  @ApiProperty({ example: '123456' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), { message: `code — ${LOGIN_CODE_LENGTH} цифр` })
  code!: string;
}

export class DeleteAccountDto {
  @ApiPropertyOptional({ description: 'Код из письма. Не нужен, если почты нет и вход через VK был только что' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), { message: `code — ${LOGIN_CODE_LENGTH} цифр` })
  code?: string;
}

export class DeleteChallengeResponse {
  @ApiProperty({
    enum: ['email', 'fresh_login'],
    description: 'email — код ушёл на почту; fresh_login — почты нет, нужен свежий вход через VK',
  })
  readonly method!: 'email' | 'fresh_login';
}
