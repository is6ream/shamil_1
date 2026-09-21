import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MAX_INVOICE_NO, ROBOKASSA_PROVIDER_CODE } from '../../config/constants';
import type { AppConfig, PaymentConfig } from '../../config/configuration';
import { DonationStatus } from '../../generated/prisma/enums';
import type { PaymentProvider } from '../payment-provider.interface';
import { WebhookParseError } from '../payment-provider.types';
import type { CreatePaymentInput, CreatedPayment, ParsedWebhook, WebhookBody } from '../payment-provider.types';
import { buildReceiptJson } from '../robokassa/receipt';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_METHOD_LENGTH,
  ROBOKASSA_CULTURE,
  ROBOKASSA_PAYMENT_URL,
} from '../robokassa/robokassa.constants';
import {
  buildInitSignatureSource,
  buildResultSignatureSource,
  formatOutSum,
  hashSignature,
  parseOutSumToKopecks,
  signaturesMatch,
} from '../robokassa/signature';
import type { ShpParams } from '../robokassa/signature';

/** Значения колбэка приходят строками; массив — признак дублированного ключа. */
function readField(body: WebhookBody, name: string): string | undefined {
  const value = body[name];

  return typeof value === 'string' ? value : undefined;
}

/**
 * Пользовательские параметры из колбэка. Мы своих `Shp_` не отправляем, но
 * подпись обязана считаться по фактическому составу тела: если параметр
 * появится (например, регион отдельным полем), проверка не должна поехать.
 */
function collectShpParams(body: WebhookBody): ShpParams {
  const collected: Record<string, string> = {};

  for (const [name, value] of Object.entries(body)) {
    if (name.toLowerCase().startsWith('shp_') && typeof value === 'string') {
      collected[name] = value;
    }
  }

  return collected;
}

/**
 * Robokassa — агрегатор-посредник: СБП, SberPay, T-Pay и карты идут одним
 * мерчант-аккаунтом, прямых договоров со Сбером и Т-Банком не нужно.
 * Ровно так работает референс на 23 878 платежах.
 *
 * Провайдер не знает ни про БД, ни про статусы доната: его дело — подписать
 * ссылку, проверить подпись колбэка и разобрать его тело.
 */
@Injectable()
export class RobokassaProvider implements PaymentProvider {
  readonly code = ROBOKASSA_PROVIDER_CODE;

  private readonly payment: PaymentConfig;

  constructor(config: ConfigService<AppConfig, true>) {
    this.payment = config.get('payment', { infer: true });

    // Валидация окружения это уже гарантировала; проверка здесь — на случай,
    // если провайдер соберут в обход конфига. Подписывать пустым паролем
    // хуже, чем не стартовать: ссылка уйдёт донатеру и будет отвергнута.
    if (this.payment.merchantId.length === 0) {
      throw new Error('RobokassaProvider: не задан PAYMENT_MERCHANT_ID');
    }

    if (this.payment.secretKey.length === 0 || this.payment.webhookSecret.length === 0) {
      throw new Error('RobokassaProvider: не задана активная пара паролей');
    }
  }

  /**
   * Подписанная ссылка на оплату. HTTP-вызова нет — Robokassa принимает
   * параметры прямо в URL, поэтому метод синхронный по существу, но
   * возвращает Promise: у Kaspi и Mbank здесь будет сетевой запрос.
   *
   * `async`, а не `Promise.resolve` в конце: метод объявлен возвращающим
   * Promise, и проверки ниже обязаны превращаться в отказ этого Promise.
   * Синхронный throw из «асинхронного» метода вызывающий не поймает
   * через `.catch()` — в платёжном потоке это потерянный заказ.
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    if (!Number.isInteger(input.invoiceNo) || input.invoiceNo < 1) {
      throw new Error(`Некорректный номер счёта: ${input.invoiceNo}`);
    }

    if (input.invoiceNo > MAX_INVOICE_NO) {
      throw new Error(`Номер счёта ${input.invoiceNo} выходит за int4, InvId его не примет`);
    }

    const outSum = formatOutSum(input.amountKopecks);
    const invId = String(input.invoiceNo);
    const description = input.description.slice(0, MAX_DESCRIPTION_LENGTH);

    // Чек уходит и в ссылку, и в подпись, но в подпись — URL-кодированным
    // (docs.robokassa.ru, «Фискализация»). Кодируем один раз здесь:
    // разное кодирование в этих двух местах и есть классическая причина
    // «подпись не сходится».
    const receiptJson = this.payment.receipt.enabled
      ? buildReceiptJson({ outSum, config: this.payment.receipt })
      : undefined;
    const receiptEncoded = receiptJson === undefined ? undefined : encodeURIComponent(receiptJson);

    const signature = hashSignature(
      buildInitSignatureSource({
        merchantLogin: this.payment.merchantId,
        outSum,
        invId,
        receipt: receiptEncoded,
        password: this.payment.secretKey,
      }),
      this.payment.hashAlgorithm,
    );

    const url = new URL(ROBOKASSA_PAYMENT_URL);

    url.searchParams.set('MerchantLogin', this.payment.merchantId);
    url.searchParams.set('OutSum', outSum);
    url.searchParams.set('InvId', invId);
    url.searchParams.set('Description', description);
    url.searchParams.set('Culture', ROBOKASSA_CULTURE);
    url.searchParams.set('Encoding', 'utf-8');
    url.searchParams.set('SignatureValue', signature);

    if (receiptJson !== undefined) {
      // searchParams кодирует значение сам — кладём сырой JSON, иначе
      // получится двойное кодирование.
      url.searchParams.set('Receipt', receiptJson);
    }

    if (this.payment.isTest) {
      url.searchParams.set('IsTest', '1');
    }

    return {
      redirectUrl: url.toString(),
      externalId: invId,
    };
  }

  /**
   * Подпись колбэка: md5(OutSum:InvId:Пароль#2[:Shp_*]).
   * Считается по сырым строкам из тела — ровно по тому, что прислали,
   * без нормализации: любое приведение здесь сломало бы сравнение.
   */
  verifySignature(body: WebhookBody): boolean {
    const received = readField(body, 'SignatureValue');
    const outSum = readField(body, 'OutSum');
    const invId = readField(body, 'InvId');

    if (received === undefined || outSum === undefined || invId === undefined) {
      return false;
    }

    const expected = hashSignature(
      buildResultSignatureSource({
        outSum,
        invId,
        password: this.payment.webhookSecret,
        shp: collectShpParams(body),
      }),
      this.payment.hashAlgorithm,
    );

    return signaturesMatch(expected, received);
  }

  parseWebhook(body: WebhookBody): ParsedWebhook {
    const invId = readField(body, 'InvId');
    const outSum = readField(body, 'OutSum');

    if (invId === undefined || outSum === undefined) {
      throw new WebhookParseError('В колбэке Robokassa нет InvId или OutSum');
    }

    const invoiceNo = Number(invId);

    if (!Number.isInteger(invoiceNo) || invoiceNo < 1 || invoiceNo > MAX_INVOICE_NO) {
      throw new WebhookParseError(`InvId вне диапазона номеров счёта: "${invId}"`);
    }

    return {
      // Собственного id события Robokassa не присылает. Ключ идемпотентности —
      // номер счёта: Result URL вызывается только по успешной оплате, значит
      // повторная доставка — это всегда то же самое событие.
      providerEventId: invId,
      invoiceNo,
      // Единственный статус, о котором Result URL вообще сообщает.
      // Отказ провайдер сюда не шлёт — донат остаётся pending.
      status: DonationStatus.paid,
      amountKopecks: parseOutSumToKopecks(outSum),
      method: this.readMethod(body),
      acknowledgement: `OK${invoiceNo}`,
    };
  }

  /**
   * Способ оплаты для живой ленты поступлений.
   *
   * TODO(словарь способов): точные значения `IncCurrLabel` / `PaymentMethod`
   * у Robokassa документацией не зафиксированы — сверить по первому колбэку
   * в тестовом режиме и завести маппинг в 'sbp' | 'card' | 'sberpay' | 'tpay'.
   * До тех пор кладём сырое значение: выдуманный маппинг молча подписал бы
   * платежи неверным способом в публичной ленте.
   */
  private readMethod(body: WebhookBody): string | undefined {
    const raw = readField(body, 'IncCurrLabel') ?? readField(body, 'PaymentMethod');

    if (raw === undefined || raw.length === 0) {
      return undefined;
    }

    return raw.toLowerCase().slice(0, MAX_METHOD_LENGTH);
  }
}
