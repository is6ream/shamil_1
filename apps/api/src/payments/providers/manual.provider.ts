import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MANUAL_PROVIDER_CODE } from '../../config/constants';
import type { AppConfig } from '../../config/configuration';
import type { PaymentProvider } from '../payment-provider.interface';
import { MANUAL_TRANSFER_PATH, ORDER_QUERY_PARAM } from '../payments.constants';
import { WebhookParseError } from '../payment-provider.types';
import type { CreatePaymentInput, CreatedPayment, ParsedWebhook } from '../payment-provider.types';

/**
 * Ручной перевод по реквизитам: донатер платит сам, поступление подтверждает
 * админ защищённым эндпоинтом.
 *
 * Это рабочий запасной путь всего проекта, а не заглушка. Мерчант-аккаунт
 * Robokassa проходит модерацию неделями (docs/payments-setup.md, трек A),
 * и если к 5 октября он не активирован, сбор всё равно принимает деньги.
 * Референс, кстати, держит этот способ постоянно.
 */
@Injectable()
export class ManualProvider implements PaymentProvider {
  readonly code = MANUAL_PROVIDER_CODE;

  private readonly siteUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.siteUrl = config.get('publicUrls', { infer: true }).siteUrl;
  }

  /**
   * Никуда не уходим с сайта: показываем страницу с реквизитами и QR СБП.
   * Номер счёта отдаём донатеру как назначение платежа — по нему админ
   * сопоставляет поступление с донатом в выписке.
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const url = new URL(`${this.siteUrl}${MANUAL_TRANSFER_PATH}`);
    url.searchParams.set(ORDER_QUERY_PARAM, input.donationId);

    return {
      redirectUrl: url.toString(),
      externalId: String(input.invoiceNo),
    };
  }

  /**
   * Колбэков у ручного перевода нет вообще — подтверждение приходит из админки.
   * Значит, любой запрос на вебхук при активном `manual` — это чужой или
   * поддельный трафик, и ответ на него один: 401.
   */
  verifySignature(): boolean {
    return false;
  }

  parseWebhook(): ParsedWebhook {
    throw new WebhookParseError(
      'Ручной перевод не принимает колбэки: поступление подтверждается админским эндпоинтом',
    );
  }
}
