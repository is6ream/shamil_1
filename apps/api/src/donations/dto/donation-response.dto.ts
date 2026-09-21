import type { DonationStatus } from '../../generated/prisma/enums';

/**
 * Ответы эндпоинтов доната.
 *
 * Суммы отдаются строками намеренно: в базе они `BigInt`, а `JSON.stringify`
 * на `BigInt` бросает исключение. Глобальный патч `BigInt.prototype.toJSON`
 * решил бы это одной строкой и молча задал бы формат всем будущим ответам —
 * поэтому конвертация явная, в мапперах.
 *
 * Ни телефона, ни `fullName` здесь нет и быть не может: эндпоинты публичные,
 * ПДн живут отдельной таблицей и в эти выборки не попадают (152-ФЗ).
 */

export interface CreatedDonationResponse {
  /** Публичный id заказа — uuid. Номер счёта провайдера наружу не выходит. */
  readonly orderId: string;
  /** Куда отправить браузер донатера. */
  readonly redirectUrl: string;
}

export interface DonationStatusResponse {
  readonly orderId: string;
  readonly status: DonationStatus;
  /** Сумма заказа в копейках, строкой. */
  readonly amountKopecks: string;
  /** Фактически оплаченная сумма из вебхука; до оплаты — `null`. */
  readonly paidAmountKopecks: string | null;
  /** ISO-8601, либо `null`, пока вебхук не пришёл. */
  readonly paidAt: string | null;
}
