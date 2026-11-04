import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { LOGIN_CODE_LENGTH } from '../donor-auth.constants';
import { normalizeEmail } from '../login-code';

const EMAIL_MAX_LENGTH = 254;

/** state и device_id из VK: алфавит base64url, длина с запасом. */
const VK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

export const toEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class RequestCodeDto {
  @ApiProperty({ example: 'donor@example.com' })
  @Transform(toEmail)
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

/** Код из письма: 6 цифр, пробелы по краям прощаем — так копируют из почты. */
export class CodeDto {
  @ApiProperty({ example: '123456', description: `${LOGIN_CODE_LENGTH} цифр из письма` })
  @Transform(trim)
  @Matches(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), { message: `code — ${LOGIN_CODE_LENGTH} цифр` })
  code!: string;
}

/**
 * Галочка «согласен на обработку персональных данных» в окне входа.
 * Без неё кнопка неактивна, а сервер принимает только `true`.
 */
class ConsentDto {
  @ApiProperty({ enum: [true], description: 'Согласие на обработку ПДн по Политике' })
  @Equals(true, { message: 'pdConsent — без согласия на обработку персональных данных войти нельзя' })
  pdConsent!: true;
}

export class VerifyCodeDto extends ConsentDto {
  @ApiProperty({ example: 'donor@example.com' })
  @Transform(toEmail)
  @IsEmail({}, { message: 'email — адрес электронной почты' })
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ example: '123456', description: `${LOGIN_CODE_LENGTH} цифр из письма` })
  @Transform(trim)
  @Matches(new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`), { message: `code — ${LOGIN_CODE_LENGTH} цифр` })
  code!: string;
}

export class VkStartDto extends ConsentDto {
  @ApiPropertyOptional({ example: '/profile/settings', description: 'Путь сайта, куда вернуть после входа' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  returnTo?: string;
}

export class VkLinkDto {
  @ApiPropertyOptional({ example: '/profile/settings' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  returnTo?: string;
}

/**
 * Query колбэка VK. Не через глобальный ValidationPipe с
 * `forbidNonWhitelisted`: VK вправе добавить параметр (`type`, `expires_in`),
 * и вход не должен из-за этого ломаться — контроллер читает нужные поля сам.
 */
export interface VkCallbackQuery {
  readonly code?: unknown;
  readonly state?: unknown;
  readonly device_id?: unknown;
}

export function readVkCallback(query: VkCallbackQuery): { code: string; state: string; deviceId: string } | null {
  const { code, state, device_id: deviceId } = query;

  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof deviceId !== 'string' ||
    !VK_TOKEN_PATTERN.test(code) ||
    !VK_TOKEN_PATTERN.test(state) ||
    !VK_TOKEN_PATTERN.test(deviceId)
  ) {
    return null;
  }

  return { code, state, deviceId };
}

export class CodeRequestedResponse {
  @ApiProperty({ description: 'Всегда true: ответ не зависит от того, есть ли такой адрес' })
  readonly accepted!: boolean;
}

export class LoginMethodsResponse {
  @ApiProperty({ description: 'Вход по коду на почту — всегда' }) readonly email!: boolean;
  @ApiProperty({ description: 'Вход через VK ID настроен' }) readonly vk!: boolean;
}

export class VkStartResponse {
  @ApiProperty({ description: 'Адрес формы VK ID — открыть в этой же вкладке' }) readonly url!: string;
}

export class DonorSessionResponse {
  @ApiProperty() readonly accessToken!: string;
  @ApiProperty({ description: 'Секунд до истечения access-токена' }) readonly expiresIn!: number;
  @ApiProperty() readonly donorId!: string;
  @ApiPropertyOptional({ nullable: true }) readonly email!: string | null;
  @ApiProperty({ description: 'Аккаунт создан этим входом' }) readonly isNew!: boolean;
}
