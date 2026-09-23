import type { DonationStatus } from '../../generated/prisma/enums';

/**
 * Ответ админского подтверждения.
 *
 * Суммы — строками: BigInt в JSON не сериализуется, а превращать копейки
 * в число по дороге наружу нельзя даже в админском ответе (так же устроен
 * публичный `DonationStatusResponse`).
 */
export interface ConfirmedDonationResponse {
  readonly orderId: string;
  readonly status: DonationStatus;
  readonly paidAmountKopecks: string | null;
  readonly paidAt: string | null;
  /**
   * `false` — донат уже был подтверждён раньше и повтор ничего не изменил.
   * Отдельное поле, а не ошибка: админ должен видеть разницу между
   * «зачислено сейчас» и «уже было», не разбирая ответ по косвенным признакам.
   */
  readonly applied: boolean;
}
