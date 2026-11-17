import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { RecurringError } from '../recurring-contract/contract';

/** Scoped to donor-auth: never changes the existing payment/admin error contract. */
@Catch()
export class DonorAuthFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const status = exception instanceof HttpException ? exception.getStatus() : 503;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    // Only forward known structured errors, never ORM/SMTP messages or validation values.
    const result: RecurringError = body && typeof body === 'object' && 'error' in body
      && body.error !== null && typeof body.error === 'object' && 'code' in body.error
      ? body as RecurringError
      : { error: { code: status === 400 ? 'VALIDATION_ERROR' : status === 401 ? 'AUTH_REQUIRED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE', message: status === 400 ? 'Проверьте поля запроса' : 'Запрос не выполнен' } };
    if (result.error.retryAfterSeconds !== undefined) response.setHeader('Retry-After', result.error.retryAfterSeconds.toString());
    response.status(status).json(result);
  }
}
