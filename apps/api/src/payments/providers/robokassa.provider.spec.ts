import { ConfigService } from '@nestjs/config';

import type { AppConfig, PaymentConfig } from '../../config/configuration';
import { PaymentHashAlgorithm, PaymentProviderCode } from '../../config/env.validation';
import { DonationStatus } from '../../generated/prisma/enums';
import { WebhookParseError } from '../payment-provider.types';
import { RobokassaProvider } from './robokassa.provider';

/**
 * Эталонные подписи (посчитаны отдельно от кода под тестом):
 *   md5('demo:100.00:42:password_1') — ссылка на оплату
 *   md5('100.00:42:password_2')      — колбэк
 */
const LINK_SIGNATURE = '42a60c45cd1a722d91aee889c3d5f59c';
const CALLBACK_SIGNATURE = '26f30947013e19685eda7f3ea6e94c99';

const BASE_PAYMENT: PaymentConfig = {
  provider: PaymentProviderCode.Robokassa,
  isTest: true,
  hashAlgorithm: PaymentHashAlgorithm.Md5,
  merchantId: 'demo',
  secretKey: 'password_1',
  webhookSecret: 'password_2',
  receipt: { enabled: false },
};

function createProvider(overrides: Partial<PaymentConfig> = {}): RobokassaProvider {
  const payment: PaymentConfig = { ...BASE_PAYMENT, ...overrides };
  const config = new ConfigService<AppConfig, true>({ payment });

  return new RobokassaProvider(config);
}

/** Донат на 100 ₽ — минимальный по ТЗ, он же слоган сбора. */
const DONATION = {
  invoiceNo: 42,
  donationId: '11111111-2222-3333-4444-555555555555',
  amountKopecks: 10_000n,
  description: 'Пожертвование на строительство мечети «Шамиль»',
};

/** Тело колбэка приходит как x-www-form-urlencoded: все значения — строки. */
const CALLBACK = {
  OutSum: '100.00',
  InvId: '42',
  SignatureValue: CALLBACK_SIGNATURE,
};

describe('RobokassaProvider: создание платежа', () => {
  test('ссылка подписана и несёт все обязательные параметры', async () => {
    // Act
    const payment = await createProvider().createPayment(DONATION);
    const url = new URL(payment.redirectUrl);

    // Assert
    expect(url.origin + url.pathname).toBe('https://auth.robokassa.ru/Merchant/Index.aspx');
    expect(url.searchParams.get('MerchantLogin')).toBe('demo');
    expect(url.searchParams.get('OutSum')).toBe('100.00');
    expect(url.searchParams.get('InvId')).toBe('42');
    expect(url.searchParams.get('SignatureValue')).toBe(LINK_SIGNATURE);
    expect(payment.externalId).toBe('42');
  });

  test('в тестовом режиме уходит IsTest=1, в боевом флага нет', async () => {
    // Act
    const test = await createProvider().createPayment(DONATION);
    const live = await createProvider({ isTest: false }).createPayment(DONATION);

    // Assert: перепутать эти два состояния — значит показать «спасибо»
    // за платёж, которого не было
    expect(new URL(test.redirectUrl).searchParams.get('IsTest')).toBe('1');
    expect(new URL(live.redirectUrl).searchParams.has('IsTest')).toBe(false);
  });

  test('описание обрезается до 100 символов, которые принимает Robokassa', async () => {
    // Act
    const payment = await createProvider().createPayment({
      ...DONATION,
      description: 'я'.repeat(250),
    });

    // Assert
    expect(new URL(payment.redirectUrl).searchParams.get('Description')).toHaveLength(100);
  });

  test('номер счёта за пределами int4 не уходит провайдеру', async () => {
    // Arrange: InvId у Robokassa — целое int4; выйти за него значит
    // получить отказ уже после того, как донатер нажал «оплатить»
    const act = createProvider().createPayment({ ...DONATION, invoiceNo: 2_147_483_648 });

    // Assert
    await expect(act).rejects.toThrow(/int4/);
  });

  test('без паролей провайдер не создаётся', () => {
    // Assert: подписывать пустым паролем хуже, чем не стартовать
    expect(() => createProvider({ secretKey: '' })).toThrow(/пара паролей/);
    expect(() => createProvider({ merchantId: '' })).toThrow(/PAYMENT_MERCHANT_ID/);
  });
});

describe('RobokassaProvider: проверка подписи колбэка', () => {
  test('верная подпись принимается', () => {
    // Assert
    expect(createProvider().verifySignature(CALLBACK)).toBe(true);
  });

  test('подпись в верхнем регистре принимается', () => {
    // Arrange: Robokassa отдаёт hex заглавными
    const body = { ...CALLBACK, SignatureValue: CALLBACK_SIGNATURE.toUpperCase() };

    // Assert
    expect(createProvider().verifySignature(body)).toBe(true);
  });

  test('подменённая сумма ломает подпись', () => {
    // Arrange: ровно та атака, от которой подпись и защищает
    const body = { ...CALLBACK, OutSum: '1.00' };

    // Assert
    expect(createProvider().verifySignature(body)).toBe(false);
  });

  test('подменённый номер счёта ломает подпись', () => {
    // Assert
    expect(createProvider().verifySignature({ ...CALLBACK, InvId: '43' })).toBe(false);
  });

  test('чужой пароль #2 не подходит', () => {
    // Assert
    expect(createProvider({ webhookSecret: 'другой' }).verifySignature(CALLBACK)).toBe(false);
  });

  test('колбэк без подписи отвергается, а не падает', () => {
    // Assert
    expect(createProvider().verifySignature({ OutSum: '100.00', InvId: '42' })).toBe(false);
    expect(createProvider().verifySignature({})).toBe(false);
  });

  test('дублированный параметр не проходит проверку', () => {
    // Arrange: express отдаёт повторённый ключ массивом — это попытка
    // рассинхронизировать подписанное и разобранное значение
    const body = { ...CALLBACK, OutSum: ['100.00', '1.00'] };

    // Assert
    expect(createProvider().verifySignature(body)).toBe(false);
  });
});

describe('RobokassaProvider: разбор колбэка', () => {
  test('успешный колбэк разбирается в оплаченный донат', () => {
    // Act
    const parsed = createProvider().parseWebhook(CALLBACK);

    // Assert
    expect(parsed).toMatchObject({
      providerEventId: '42',
      invoiceNo: 42,
      status: DonationStatus.paid,
      amountKopecks: 10_000n,
      acknowledgement: 'OK42',
    });
  });

  test('сумма берётся из колбэка, а не из заказа', () => {
    // Arrange: донатер мог доплатить или недоплатить — в витрины идёт факт
    const parsed = createProvider().parseWebhook({ ...CALLBACK, OutSum: '500.000000' });

    // Assert
    expect(parsed.amountKopecks).toBe(50_000n);
  });

  test('способ оплаты кладётся сырым значением, а не выдуманным маппингом', () => {
    // Act
    const parsed = createProvider().parseWebhook({ ...CALLBACK, IncCurrLabel: 'SBPSBP' });

    // Assert
    expect(parsed.method).toBe('sbpsbp');
  });

  test('неразбираемый InvId — ошибка, а не молчаливый ноль', () => {
    // Assert
    expect(() => createProvider().parseWebhook({ ...CALLBACK, InvId: 'abc' })).toThrow(
      WebhookParseError,
    );
    expect(() => createProvider().parseWebhook({ ...CALLBACK, InvId: '0' })).toThrow(
      WebhookParseError,
    );
  });

  test('колбэк без обязательных полей — ошибка', () => {
    // Assert
    expect(() => createProvider().parseWebhook({ SignatureValue: 'x' })).toThrow(
      WebhookParseError,
    );
  });
});
