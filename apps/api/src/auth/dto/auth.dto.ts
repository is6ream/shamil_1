import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '../auth.constants';

const EMAIL_MAX_LENGTH = 254;

/**
 * Вход. Длина пароля при входе не проверяется по политике — только верхняя
 * граница против мусора: старый пароль, заведённый до смены правил,
 * не должен запирать человека снаружи.
 */
export class LoginDto {
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  /** Политика (длина в байтах) дополнительно проверяется в PasswordService. */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_BYTES)
  newPassword!: string;
}
