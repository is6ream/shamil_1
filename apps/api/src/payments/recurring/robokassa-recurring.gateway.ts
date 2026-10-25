import { ROBOKASSA_PROVIDER_CODE } from '../../config/constants';
import type { PaymentConfig } from '../../config/configuration';
import { MAX_DESCRIPTION_LENGTH } from '../robokassa/robokassa.constants';
import { buildInitSignatureSource, formatOutSum, hashSignature, parseOutSumToKopecks } from '../robokassa/signature';
import { RecurringGatewayError } from './recurring-gateway';
import type { ChargeState, RecurringChargeInput, RecurringGateway, RecurringSubmitResult } from './recurring-gateway';

/** Сколько ждём ответа Robokassa: тик планировщика не должен висеть на одном запросе. */
const HTTP_TIMEOUT_MS = 15_000;

/** Колбэк обычно приходит за секунды; сверяем через 15 минут, чтобы не дёргать OpStateExt зря. */
const RECONCILE_DELAY_MS = 15 * 60_000;

/** Длина причины отказа: колонка `last_failure_reason` — VarChar(255). */
const MAX_REASON_LENGTH = 200;

/**
 * Коды OpStateExt (docs.robokassa.ru/ru/xml-interfaces):
 * Result.Code 0 — успех запроса, 3 — операция не найдена;
 * State.Code 100 — оплачено, 10 — отменено без оплаты, 60 — отклонено,
 * 5 / 20 / 50 / 80 — ещё в работе.
 */
const RESULT_OK = 0;
const RESULT_NOT_FOUND = 3;
const STATE_PAID = 100;
const FAILED_STATES = new Map<number, string>([
  [10, 'Платёж отменён, деньги не поступили'],
  [60, 'Платёж отклонён банком'],
]);

function readXmlCode(xml: string, section: string): number | null {
  const match = new RegExp(`<${section}>[\\s\\S]*?<Code>(\\d+)</Code>`).exec(xml);

  return match?.[1] === undefined ? null : Number(match[1]);
}

function readXmlValue(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);

  return match?.[1] ?? null;
}

/**
 * Рекурренты Robokassa: `POST /Merchant/Recurring` и OpStateExt.
 *
 * Подпись запроса списания — та же, что у ссылки оплаты, с новым номером
 * счёта: `MerchantLogin:OutSum:InvoiceID:Пароль#1`; `PreviousInvoiceID`
 * в подпись не входит (документация, раздел «Повторные платежи»).
 * TODO(robokassa): документация не приводит формулу целиком — подтвердить
 * на первом тестовом автосписании после подключения услуги.
 *
 * Подпись OpStateExt — `MerchantLogin:InvoiceID:Пароль#2`.
 */
export class RobokassaRecurringGateway implements RecurringGateway {
  readonly providerCode = ROBOKASSA_PROVIDER_CODE;
  readonly reconcileDelayMs: number;

  constructor(
    private readonly payment: PaymentConfig,
    reconcileDelayMs: number = RECONCILE_DELAY_MS,
  ) {
    this.reconcileDelayMs = reconcileDelayMs;
  }

  async submit(input: RecurringChargeInput): Promise<RecurringSubmitResult> {
    const outSum = formatOutSum(input.amountKopecks);
    const invoiceId = String(input.invoiceNo);
    const signature = hashSignature(
      buildInitSignatureSource({
        merchantLogin: this.payment.merchantId,
        outSum,
        invId: invoiceId,
        password: this.payment.secretKey,
      }),
      this.payment.hashAlgorithm,
    );
    const body = new URLSearchParams({
      MerchantLogin: this.payment.merchantId,
      InvoiceID: invoiceId,
      PreviousInvoiceID: String(input.previousInvoiceNo),
      Description: input.description.slice(0, MAX_DESCRIPTION_LENGTH),
      OutSum: outSum,
      SignatureValue: signature,
    });

    if (this.payment.isTest) {
      // TODO(robokassa): в списке параметров рекуррента IsTest не упомянут —
      // уточнить у поддержки, как автосписания работают в тестовом режиме.
      body.set('IsTest', '1');
    }

    const response = await this.request(this.payment.recurringUrl, { method: 'POST', body });
    const answer = (await response.text()).trim();

    if (response.ok && answer.startsWith('OK')) {
      return { accepted: true };
    }

    return { accepted: false, reason: `Robokassa: ${answer.slice(0, MAX_REASON_LENGTH) || response.status}` };
  }

  async checkState(invoiceNo: number): Promise<ChargeState> {
    const invoiceId = String(invoiceNo);
    const signature = hashSignature(
      `${this.payment.merchantId}:${invoiceId}:${this.payment.webhookSecret}`,
      this.payment.hashAlgorithm,
    );
    const url = new URL(this.payment.opStateUrl);

    url.searchParams.set('MerchantLogin', this.payment.merchantId);
    url.searchParams.set('InvoiceID', invoiceId);
    url.searchParams.set('Signature', signature);

    const response = await this.request(url.toString(), { method: 'GET' });

    return parseOpState(await response.text());
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    } catch (error: unknown) {
      throw new RecurringGatewayError(
        `Robokassa недоступна: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Ответ OpStateExt → состояние списания. Непонятный ответ — ошибка, а не «отказ». */
export function parseOpState(xml: string): ChargeState {
  const result = readXmlCode(xml, 'Result');

  if (result === RESULT_NOT_FOUND) {
    return { kind: 'not_found' };
  }

  if (result !== RESULT_OK) {
    throw new RecurringGatewayError(`OpStateExt вернул Result.Code=${result ?? 'нет'}`);
  }

  const state = readXmlCode(xml, 'State');

  if (state === STATE_PAID) {
    const outSum = readXmlValue(xml, 'OutSum');

    return { kind: 'paid', amountKopecks: outSum === null ? null : parseOutSumToKopecks(outSum) };
  }

  const failure = state === null ? undefined : FAILED_STATES.get(state);

  if (failure !== undefined) {
    return { kind: 'failed', reason: failure };
  }

  return { kind: 'pending' };
}
