import { DonationStatus } from '../generated/prisma/enums';

/**
 * Разрешённые переходы статуса доната — зеркало триггера `donation_status_guard`
 * в миграции `…_guards_and_stats`. База всё равно не даст сделать лишнего,
 * но сервис вебхуков должен отличать «дубликат, отвечаем 200» от «ошибка».
 *
 * `paid` — финальное состояние: после него не меняется ничего.
 * `failed → paid` разрешён: отказной колбэк может прийти раньше успешного,
 * и в этом случае деньги важнее порядка доставки.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<DonationStatus, readonly DonationStatus[]>> = {
  [DonationStatus.pending]: [DonationStatus.paid, DonationStatus.failed],
  [DonationStatus.failed]: [DonationStatus.paid],
  [DonationStatus.paid]: [],
};

export class DonationStatusTransitionError extends Error {
  constructor(
    readonly from: DonationStatus,
    readonly to: DonationStatus,
  ) {
    super(`Переход доната "${from}" → "${to}" запрещён`);
    this.name = 'DonationStatusTransitionError';
  }
}

/**
 * Повтор того же статуса — не переход: агрегаторы ретраят колбэк до 200,
 * и второй `paid → paid` обязан проходить как no-op.
 */
export function canTransition(from: DonationStatus, to: DonationStatus): boolean {
  if (from === to) {
    return true;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Переход что-то реально меняет — значит, нужна запись в БД. */
export function isEffectiveTransition(from: DonationStatus, to: DonationStatus): boolean {
  return from !== to && canTransition(from, to);
}

export function assertTransition(from: DonationStatus, to: DonationStatus): void {
  if (!canTransition(from, to)) {
    throw new DonationStatusTransitionError(from, to);
  }
}
