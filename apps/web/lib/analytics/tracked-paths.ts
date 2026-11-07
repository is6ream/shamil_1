/**
 * Где Метрика не нужна. Админка — закрытый кабинет владельцев сайта:
 * Вебвизор записал бы списки пожертвований и ПДн из карточек донатов,
 * а визиты админов искажали бы отчёты по сбору.
 */
const UNTRACKED_PREFIXES = ["/admin"] as const;

export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
