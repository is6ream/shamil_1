import { SubscriptionStatus } from '../generated/prisma/enums';

/**
 * Переходы статуса подписки. Та же таблица живёт в триггере
 * `subscription_status_guard` миграции `…_donor_cabinet_subscriptions`:
 * сервис проверяет заранее, чтобы ответить человеческим 409, а база — на случай,
 * если в обход сервиса напишет кто-то ещё (админка, сиды, ручной SQL).
 *
 * PENDING  → ACTIVE (первый платёж прошёл) | CANCELLED (передумал до оплаты)
 * ACTIVE   → PAUSED | CANCELLED | FAILED (три отказа подряд)
 * PAUSED   → ACTIVE | CANCELLED
 * FAILED   → CANCELLED (чтобы убрать из кабинета; карту заново не списываем)
 * CANCELLED — финально.
 */
const ALLOWED: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  [SubscriptionStatus.PENDING]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.PAUSED, SubscriptionStatus.CANCELLED, SubscriptionStatus.FAILED],
  [SubscriptionStatus.PAUSED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.FAILED]: [SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.CANCELLED]: [],
};

export function canTransitionSubscription(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}

/** Подписка, по которой ещё будут списания или которую можно возобновить. */
export function isLiveSubscription(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.PAUSED;
}
