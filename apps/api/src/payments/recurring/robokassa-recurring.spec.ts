import type { PaymentConfig } from '../../config/configuration';
import { PaymentHashAlgorithm } from '../../config/env.validation';
import { hashSignature } from '../robokassa/signature';
import { queryRecurring, sendRecurring } from './robokassa-recurring';

const payment = {
  merchantId: 'test-store', secretKey: 'local-test-1', webhookSecret: 'local-test-2',
  hashAlgorithm: PaymentHashAlgorithm.Md5,
} as PaymentConfig;
const order = { id: 'donation-id', invoiceNo: 22, amountKopecks: 10005n };

describe('Robokassa recurring transport (mock)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('signs the child without the parent number or checkout fields', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK+22'));
    await expect(sendRecurring(payment, order, 17)).resolves.toBe('accepted');
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://auth.robokassa.ru/Merchant/Recurring');
    const body = request?.body as URLSearchParams;
    expect(body.get('OutSum')).toBe('100.05');
    expect(body.get('PreviousInvoiceID')).toBe('17');
    expect(body.get('SignatureValue')).toBe(hashSignature(
      'test-store:100.05:22:local-test-1:Shp_order_id=donation-id', PaymentHashAlgorithm.Md5,
    ));
    for (const key of ['IncCurrLabel', 'Recurring', 'ExpirationDate', 'Receipt']) expect(body.has(key)).toBe(false);
  });

  it('keeps a lost response unknown and checks the same invoice', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response('<OperationStateResponse><Result><Code>0</Code></Result><State><Code>10</Code></State></OperationStateResponse>'));
    await expect(sendRecurring(payment, order, 17)).resolves.toBe('unknown');
    await expect(queryRecurring(payment, order.invoiceNo)).resolves.toEqual({ kind: 'failed' });
    expect((fetcher.mock.calls[1]?.[0] as URL).searchParams.get('InvoiceID')).toBe('22');
  });

  it('extracts only settlement fields from successful reconciliation', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<OperationStateResponse xmlns="http://merchant.roboxchange.com/WebService/">' +
      '<Result><Code>0</Code></Result><State><Code>100</Code><StateDate>2026-11-03T23:50:00+03:00</StateDate></State>' +
      '<Info><PaymentMethod><Code>mock-card</Code></PaymentMethod><OutSum>100.050000</OutSum><OutCurrLabel>RUB</OutCurrLabel></Info><UserFields><Field><Name>Shp_order_id</Name><Value>donation-id</Value></Field></UserFields></OperationStateResponse>',
    ));
    await expect(queryRecurring(payment, 22)).resolves.toEqual({
      kind: 'paid', netAmountKopecks: 10005n, currency: 'RUB', orderId: 'donation-id', method: 'mock-card', confirmedAt: new Date('2026-11-03T20:50:00Z'),
    });
  });

  it('never sends child or XML queries with test credentials or invalid invoices', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call'));
    await expect(sendRecurring({ ...payment, isTest: true }, order, 17)).resolves.toBe('unknown');
    await expect(queryRecurring({ ...payment, isTest: true }, 22)).resolves.toEqual({ kind: 'unknown' });
    await expect(sendRecurring(payment, { ...order, invoiceNo: 0 }, 17)).resolves.toBe('unknown');
    await expect(sendRecurring(payment, order, 0)).resolves.toBe('unknown');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['OK+23', 'OK', 'ERROR', ''])('does not treat response %s as proof of success', async response => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(response));
    await expect(sendRecurring(payment, order, 17)).resolves.toBe('unknown');
  });

  it('uses Password 2 for the read-only merchant/invoice XML signature', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid'));
    await queryRecurring(payment, 22);
    const url = fetcher.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get('MerchantLogin')).toBe('test-store');
    expect(url.searchParams.get('Signature')).toBe(hashSignature('test-store:22:local-test-2', PaymentHashAlgorithm.Md5));
  });

  it('does not accept a successful XML without the echoed order binding', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      '<OperationStateResponse><Result><Code>0</Code></Result><State><Code>100</Code>' +
      '<StateDate>2026-11-03T23:50:00+03:00</StateDate></State>' +
      '<Info><OutSum>100.05</OutSum><OutCurrLabel>RUB</OutCurrLabel></Info></OperationStateResponse>',
    ));
    await expect(queryRecurring(payment, 22)).resolves.toEqual({ kind: 'unknown' });
  });
});
