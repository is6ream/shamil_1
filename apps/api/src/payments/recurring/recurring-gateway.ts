/**
 * Автосписание по сохранённой карте. Отдельно от `PaymentProvider`: ссылку
 * на оплату умеет делать каждый провайдер, а списать без участия человека —
 * только тот, у кого подключены рекурренты (у Robokassa — по согласованию).
 *
 * Поток устроен вокруг того, как отвечает Robokassa:
 *  - `submit` — запрос списания. Ответ «OK+InvoiceID» значит «операция создана»,
 *    а не «деньги списаны» (docs.robokassa.ru/ru/recurring-payments);
 *  - успех приходит на тот же Result URL, что и обычный платёж;
 *  - об отказе Result URL молчит — его видно только по `checkState`
 *    (XML-интерфейс OpStateExt). Поэтому планировщик сверяет висящие
 *    автосписания сам, а не ждёт колбэка вечно.
 */

export const RECURRING_GATEWAY = Symbol('RECURRING_GATEWAY');

export interface RecurringChargeInput {
  /** Новый номер счёта — InvId CHILD-доната. */
  readonly invoiceNo: number;
  /** InvId первого платежа подписки — `PreviousInvoiceID`. */
  readonly previousInvoiceNo: number;
  readonly amountKopecks: bigint;
  readonly description: string;
}

export type RecurringSubmitResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

export type ChargeState =
  | { readonly kind: 'paid'; readonly amountKopecks: bigint | null }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'pending' }
  /** Провайдер операцию не знает: запрос не дошёл или упал до создания. */
  | { readonly kind: 'not_found' };

export interface RecurringGateway {
  /** Код провайдера CHILD-доната и событий по нему. */
  readonly providerCode: string;
  /**
   * Через сколько после отправки сверять статус. У Robokassa колбэку даём
   * время прийти самому; у имитации ждать нечего.
   */
  readonly reconcileDelayMs: number;
  submit(input: RecurringChargeInput): Promise<RecurringSubmitResult>;
  checkState(invoiceNo: number): Promise<ChargeState>;
}

export class RecurringGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurringGatewayError';
  }
}
