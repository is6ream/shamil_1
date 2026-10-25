import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';

import { LOGIN_CODE_LENGTH } from '../donor-auth.constants';
import { normalizeEmail } from '../login-code';

const EMAIL_MAX_LENGTH = 254;

const toEmail = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? normalizeEmail(value) : value);

export class RequestCodeDto {
  @ApiProperty({ example: 'donor@example.com' })
  @Transform(toEmail)
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

export class VerifyCodeDto extends RequestCodeDto {
  @ApiProperty({ example: '123456', description: `${LOGIN_CODE_LENGTH} цифр из письма` })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), { message: `code — ${LOGIN_CODE_LENGTH} цифр` })
  code!: string;
}

export class CodeRequestedResponse {
  @ApiProperty({ description: 'Всегда true: ответ не зависит от того, есть ли такой адрес' })
  readonly accepted!: boolean;
}

export class DonorSessionResponse {
  @ApiProperty() readonly accessToken!: string;
  @ApiProperty({ description: 'Секунд до истечения access-токена' }) readonly expiresIn!: number;
  @ApiProperty() readonly donorId!: string;
  @ApiProperty() readonly email!: string;
  @ApiProperty({ description: 'Аккаунт создан этим входом' }) readonly isNew!: boolean;
}
