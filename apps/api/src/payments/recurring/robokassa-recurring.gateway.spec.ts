import { createHash } from 'node:crypto';

import type { PaymentConfig } from '../../config/configuration';
import { PaymentHashAlgorithm, PaymentProviderCode, RecurringEmulatorOutcome } from '../../config/env.validation';
import { RobokassaRecurringGateway, parseOpState } from './robokassa-recurring.gateway';

const PAYMENT: PaymentConfig = {
  provider: PaymentProviderCode.Robokassa,
  isTest: false,
  hashAlgorithm: PaymentHashAlgorithm.Md5,
  merchantId: 'shamil',
  secretKey: 'password_1',
  webhookSecret: 'password_2',
  paymentUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
  emulatorEnabled: false,
  receipt: { enabled: false },
  recurringUrl: 'https://auth.robokassa.ru/Merchant/Recurring',
  opStateUrl: 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt',
  recurringEmulatorOutcome: RecurringEmulatorOutcome.Paid,
};

const md5 = (source: string): string => createHash('md5').update(source, 'utf8').digest('hex');

describe('рекурренты Robokassa', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('запрос списания: POST с PreviousInvoiceID, подпись без него', async () => {
    // Arrange
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('OK+501'));
    const gateway = new RobokassaRecurringGateway(PAYMENT);

    // Act
    const result = await gateway.submit({
      invoiceNo: 501,
      previousInvoiceNo: 154,
      amountKopecks: 50_000n,
      description: 'Ежемесячное пожертвование',
    });

    // Assert
    expect(result).toEqual({ accepted: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(url).toBe(PAYMENT.recurringUrl);
    expect(init.method).toBe('POST');
    expect(body.get('InvoiceID')).toBe('501');
    expect(body.get('PreviousInvoiceID')).toBe('154');
    expect(body.get('OutSum')).toBe('500.00');
    expect(body.get('SignatureValue')).toBe(md5('shamil:500.00:501:password_1'));
    // Параметры, которых в рекурренте быть не должно (документация)
    expect(body.has('Recurring')).toBe(false);
    expect(body.has('IncCurrLabel')).toBe(false);
  });

  test('ответ не OK — отказ с текстом провайдера', async () => {
    // Arrange
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('ERROR: Previous invoice not found'));

    // Act
    const result = await new RobokassaRecurringGateway(PAYMENT).submit({
      invoiceNo: 2,
      previousInvoiceNo: 1,
      amountKopecks: 10_000n,
      description: 'x',
    });

    // Assert
    expect(result).toEqual({ accepted: false, reason: 'Robokassa: ERROR: Previous invoice not found' });
  });

  test('OpStateExt подписывается паролем #2', async () => {
    // Arrange
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('<Result><Code>0</Code></Result><State><Code>5</Code></State>'));

    // Act
    const state = await new RobokassaRecurringGateway(PAYMENT).checkState(501);

    // Assert
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.get('Signature')).toBe(md5('shamil:501:password_2'));
    expect(state).toEqual({ kind: 'pending' });
  });

  test.each([
    ['<Result><Code>0</Code></Result><State><Code>100</Code></State><Info><OutSum>500.000000</OutSum></Info>', { kind: 'paid', amountKopecks: 50_000n }],
    ['<Result><Code>0</Code></Result><State><Code>60</Code></State>', { kind: 'failed', reason: 'Платёж отклонён банком' }],
    ['<Result><Code>0</Code></Result><State><Code>10</Code></State>', { kind: 'failed', reason: 'Платёж отменён, деньги не поступили' }],
    ['<Result><Code>3</Code></Result>', { kind: 'not_found' }],
  ])('разбор OpStateExt: %s', (xml, expected) => {
    expect(parseOpState(xml)).toEqual(expected);
  });

  test('неверная подпись OpStateExt — ошибка, а не «отказ платежа»', () => {
    expect(() => parseOpState('<Result><Code>1</Code></Result>')).toThrow(/Result.Code=1/);
  });
});
