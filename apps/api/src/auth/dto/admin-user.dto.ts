import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { AdminRole } from '../../generated/prisma/enums';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '../auth.constants';

const DISPLAY_NAME_MAX_LENGTH = 120;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdminUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_BYTES)
  password!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;
}

/** Частичная правка: передаются только меняющиеся поля. `displayName: null` — стереть имя. */
export class UpdateAdminUserDto {
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @Transform(trimString)
  @ValidateIf((_dto: UpdateAdminUserDto, value: unknown) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_BYTES)
  newPassword!: string;
}
