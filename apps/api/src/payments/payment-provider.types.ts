import type { DonationStatus } from '../generated/prisma/enums';

/**
 * Словарь платёжного слоя. Ни одно поле здесь не принадлежит конкретному
 * провайдеру: Robokassa закрывает РФ, а Kaspi (KZ) и Mbank (KG) — главная
 * претензия заказчика к референсу — придут отдельными реализациями
 * и не должны потребовать переписывания потока.
 */

/** Заказ, из которого провайдер делает ссылку на оплату. Собран сервером. */
export interface CreatePaymentInput {
  /**
   * Числовой номер счёта. Robokassa принимает InvId только как int4,
   * uuid ей отдать нельзя (см. миграцию `…_donation_invoice_no`).
   */
  readonly invoiceNo: number;
  /** Публичный идентификатор заказа: uuid доната, он же order_id на «спасибо». */
  readonly donationId: string;
  /** Сумма заказа в копейках. Целое число — на деньгах float не появляется нигде. */
  readonly amountKopecks: bigint;
  /** Назначение платежа: видит донатер на стороне провайдера. */
  readonly description: string;
}

export interface CreatedPayment {
  /** Куда отправить браузер донатера. */
  readonly redirectUrl: string;
  /**
   * Идентификатор платежа на стороне провайдера — ложится
   * в `donation.provider_payment_id`. У Robokassa это InvId строкой.
   */
  readonly externalId: string;
}

/**
 * Разобранное тело колбэка. Robokassa шлёт `x-www-form-urlencoded`,
 * поэтому значения — строки; `unknown` вместо `string` намеренно:
 * это данные из внешнего мира, и сужать их обязан провайдер, а не вызывающий.
 */
export type WebhookBody = Readonly<Record<string, unknown>>;

export interface ParsedWebhook {
  /**
   * Ключ идемпотентности. Уникальный `(provider, provider_event_id)`
   * в `payment_event` — это и есть защита от ретраев: агрегаторы повторяют
   * доставку, пока не получат 200, и без ключа донат задвоится в сумме сбора
   * и в рейтинге региона.
   *
   * У Robokassa собственного id события нет, поэтому ключом служит номер счёта:
   * Result URL вызывается только по успешной оплате, и повтор — это всегда
   * то же самое событие. Провайдеру, который шлёт и отказ, и успех, сюда
   * нужно класть его собственный id, иначе второе событие по тому же счёту
   * упрётся в индекс и потеряется.
   */
  readonly providerEventId: string;
  /** По нему донат находится в БД. */
  readonly invoiceNo: number;
  /** Статус из колбэка. Клиентскому редиректу не верим никогда. */
  readonly status: DonationStatus;
  /** Фактически оплаченная сумма в копейках — из колбэка, не из формы. */
  readonly amountKopecks: bigint;
  /** Способ внутри провайдера: 'sbp' | 'card' | 'sberpay' | 'tpay'. Для живой ленты. */
  readonly method?: string;
  /**
   * Тело ответа, которого ждёт провайдер. Robokassa считает колбэк принятым
   * только получив строку `OK{InvId}`; что угодно другое она будет ретраить.
   */
  readonly acknowledgement: string;
}

export class WebhookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookParseError';
  }
}
