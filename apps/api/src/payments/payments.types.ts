import type { DonationStatus } from '../generated/prisma/enums';

/**
 * Словарь применения платёжных событий. Отдельно от `payment-provider.types.ts`:
 * там контракт с внешним миром, здесь — то, что происходит внутри сервиса
 * и одинаково для вебхука и для ручного подтверждения из админки.
 */

/**
 * Что сделало событие с донатом.
 *
 * `duplicate` и `ignored` — оба не ошибка. Первое означает, что событие с таким
 * ключом уже записано (ретрай агрегатора, повторный клик админа), второе —
 * что событие новое, но перехода не даёт: донат уже оплачен, а `paid` финально.
 */
export type PaymentEventOutcome = 'applied' | 'duplicate' | 'ignored';

/** Событие, применяемое к донату. Собирается вызывающим — вебхуком или админкой. */
export interface ApplyEventInput {
  readonly donationId: string;
  /**
   * Код провайдера события — берётся из самого доната, а не из активного
   * провайдера приложения. При `PAYMENT_PROVIDER=robokassa` админ всё равно
   * подтверждает `manual`-донаты, и записать их событие под кодом агрегатора
   * значило бы сломать ключ идемпотентности `(provider, provider_event_id)`.
   */
  readonly provider: string;
  readonly providerEventId: string;
  readonly status: DonationStatus;
  readonly amountKopecks: bigint;
  readonly method?: string;
  /** Тело события для разбора спорных платежей. ПДн сюда не попадают. */
  readonly payload: Readonly<Record<string, string>>;
}

/**
 * Префикс детерминированного ключа события ручного подтверждения:
 * `manual:<invoiceNo>`. Собственного id события у ручного перевода нет —
 * ключом служит номер счёта, и повторное подтверждение упирается
 * в уникальный индекс, а не задваивает сумму сбора.
 */
export const MANUAL_EVENT_ID_PREFIX = 'manual:';

export interface ManualConfirmationOptions {
  /** Фактически поступившая сумма. Не передана — зачисляется сумма заказа. */
  readonly amountKopecks?: bigint;
  /** Как пришли деньги: перевод по реквизитам, СБП, наличные. */
  readonly method?: string;
}

export interface ManualConfirmation {
  readonly orderId: string;
  readonly status: DonationStatus;
  readonly paidAmountKopecks: bigint | null;
  readonly paidAt: Date | null;
  /**
   * `false` — донат уже был подтверждён раньше и повтор ничего не изменил.
   * Это не ошибка: админ мог нажать дважды или подтвердить уже дошедший платёж.
   */
  readonly applied: boolean;
}
