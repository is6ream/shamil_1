import type { PaymentConfig } from '../../config/configuration';
import { buildInitSignatureSource, formatOutSum, hashSignature, parseOutSumToKopecks } from '../robokassa/signature';

const base = 'https://auth.robokassa.ru/Merchant';
const timeout = 4000;

export async function sendRecurring(payment: PaymentConfig, order: {
  id: string; invoiceNo: number; amountKopecks: bigint;
}, firstInvoiceNo: number): Promise<'accepted' | 'unknown'> {
  // Merchant/Recurring has no safe test mode. Never fall through with test credentials.
  if (payment.isTest || !Number.isSafeInteger(order.invoiceNo) || order.invoiceNo <= 0
    || !Number.isSafeInteger(firstInvoiceNo) || firstInvoiceNo <= 0 || order.amountKopecks <= 0n) return 'unknown';
  const outSum = formatOutSum(order.amountKopecks);
  const invId = String(order.invoiceNo);
  const shp = { Shp_order_id: order.id };
  const signature = hashSignature(buildInitSignatureSource({
    merchantLogin: payment.merchantId, outSum, invId, password: payment.secretKey, shp,
  }), payment.hashAlgorithm);

  try {
    const response = await fetch(base + '/Recurring', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
      body: new URLSearchParams({
        MerchantLogin: payment.merchantId,
        InvoiceID: invId,
        PreviousInvoiceID: String(firstInvoiceNo),
        OutSum: outSum,
        Description: 'Регулярное добровольное пожертвование',
        SignatureValue: signature,
        ...shp,
      }),
    });
    return response.ok && (await response.text()).trim() === 'OK+' + invId ? 'accepted' : 'unknown';
  } catch {
    return 'unknown';
  }
}

type State = { kind: 'paid'; netAmountKopecks: bigint; currency: string; orderId: string; method: string; confirmedAt: Date }
  | { kind: 'failed' | 'pending' | 'unknown' };

// The fixed TLS endpoint returns this documented XML structure. Read only
// scalar fields from known sections and discard the response (it contains PII).
function field(xml: string, name: string): string {
  return new RegExp('<' + name + '(?:\\s[^>]*)?>([^]*?)</' + name + '>').exec(xml)?.[1]?.trim() ?? '';
}

export async function queryRecurring(payment: PaymentConfig, invoiceNo: number): Promise<State> {
  if (payment.isTest || !Number.isSafeInteger(invoiceNo) || invoiceNo <= 0) return { kind: 'unknown' };
  const url = new URL(base + '/WebService/Service.asmx/OpStateExt');
  url.search = new URLSearchParams({
    MerchantLogin: payment.merchantId,
    InvoiceID: String(invoiceNo),
    Signature: hashSignature(
      [payment.merchantId, invoiceNo, payment.webhookSecret].join(':'), payment.hashAlgorithm,
    ),
  }).toString();

  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return { kind: 'unknown' };
    const document = await response.text();
    if (document.length > 32000 || /<!DOCTYPE|<!ENTITY/i.test(document)) return { kind: 'unknown' };
    const xml = field(document, 'OperationStateResponse');
    if (field(field(xml, 'Result'), 'Code') !== '0') return { kind: 'unknown' };
    const state = field(xml, 'State');
    const code = field(state, 'Code');
    if (code === '10' || code === '60') return { kind: 'failed' };
    if (['5', '20', '50', '80'].includes(code)) return { kind: 'pending' };
    if (code !== '100') return { kind: 'unknown' };
    const info = field(xml, 'Info');
    const amount = parseOutSumToKopecks(field(info, 'OutSum'));
    const rawDate = field(state, 'StateDate');
    const confirmedAt = new Date(rawDate);
    if (!/(?:Z|[+-]\d\d:\d\d)$/.test(rawDate) || !Number.isFinite(+confirmedAt) || amount <= 0n) {
      return { kind: 'unknown' };
    }
    const bindings = [...field(xml, 'UserFields').matchAll(/<Field(?:\s[^>]*)?>([^]*?)<\/Field>/g)]
      .map(match => match[1] ?? '').filter(value => field(value, 'Name') === 'Shp_order_id');
    if (bindings.length !== 1) return { kind: 'unknown' };
    // The live merchant returns BNR for ruble settlement to its bank account.
    const currency = field(info, 'OutCurrLabel');
    return { kind: 'paid', netAmountKopecks: amount, currency: currency === 'BNR' ? 'RUB' : currency,
      orderId: field(bindings[0] ?? '', 'Value'), method: field(field(info, 'PaymentMethod'), 'Code'), confirmedAt };
  } catch {
    return { kind: 'unknown' };
  }
}
