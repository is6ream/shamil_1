import { HttpException } from '@nestjs/common';
import type { RecurringErrorCode } from '../recurring-contract/contract';

export function donorError(status: number, code: RecurringErrorCode, message: string, retryAfterSeconds?: number): HttpException {
  return new HttpException({ error: { code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) } }, status);
}

export const authRequired = (): HttpException => donorError(401, 'AUTH_REQUIRED', 'Требуется вход');
export const invalidCode = (): HttpException => donorError(401, 'EMAIL_CODE_INVALID', 'Код неверный или устарел');
export const mailUnavailable = (): HttpException => donorError(503, 'EMAIL_UNAVAILABLE', 'Отправка кода временно недоступна');
