import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import { WebhookParseError } from './payment-provider.types';
import type { WebhookBody } from './payment-provider.types';
import { PaymentsService } from './payments.service';
import { PAYMENTS_ROUTE_PREFIX, ROBOKASSA_RESULT_ROUTE } from './robokassa/robokassa.constants';

@Controller(PAYMENTS_ROUTE_PREFIX)
export class PaymentCallbacksController {
  private readonly logger = new Logger(PaymentCallbacksController.name);

  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Result URL — единственный канал, подтверждающий платёж.
   *
   * `@SkipThrottle` здесь обязателен: глобальный ThrottlerGuard отдал бы
   * провайдеру 429 на серии ретраев, тот продолжил бы повторять, и донаты
   * зависли бы в pending при фактически списанных деньгах. Защита этой точки —
   * подпись, а не счётчик запросов.
   *
   * Тело колбэка не логируется: провайдер кладёт туда почту плательщика.
   */
  @Post(ROBOKASSA_RESULT_ROUTE)
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async handleRobokassaResult(@Body() body: WebhookBody): Promise<string> {
    // Проверка подписи ДО разбора тела: неподписанный колбэк не должен
    // оставить в базе ни строки.
    if (!this.provider.verifySignature(body)) {
      this.logger.warn('Колбэк с неверной подписью отклонён');

      throw new UnauthorizedException('Подпись колбэка не сошлась');
    }

    const parsed = this.parse(body);

    await this.payments.applyWebhook(parsed, body);

    // Robokassa считает колбэк принятым, только получив ровно эту строку;
    // что угодно другое она будет ретраить.
    return parsed.acknowledgement;
  }

  /**
   * Подпись сошлась, а тело не разбирается — это не подделка, а расхождение
   * с документацией провайдера. Молчать о нём нельзя: 400 и запись в лог,
   * чтобы это всплыло сразу, а не на разборе пропавших платежей.
   */
  private parse(body: WebhookBody): ReturnType<PaymentProvider['parseWebhook']> {
    try {
      return this.provider.parseWebhook(body);
    } catch (error: unknown) {
      if (error instanceof WebhookParseError) {
        this.logger.error(`Подписанный колбэк не разобран: ${error.message}`);

        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }
}
