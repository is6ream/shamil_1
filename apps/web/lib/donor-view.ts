export const donorStates: Record<string, string> = {
 pending: "Ожидает подтверждения", active: "Автоплатёж подключён", cancelled: "Будущие списания отключены",
 failed: "Платёж не выполнен", review: "Состояние проверяется", unknown: "Результат уточняется",
 reserved: "Операция подготовлена", accepted: "Платёж обрабатывается", paid: "Оплачен", skipped: "Пропущен",
};
export function donorState(value: string) { return donorStates[value] ?? "Состояние уточняется"; }
export function donorMoney(amount: string) {
 const value = BigInt(amount); return (value / 100n).toLocaleString("ru-RU") + "," + (value % 100n).toString().padStart(2, "0") + " ₽";
}
export function donorDate(value: string) { return new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long", timeStyle: "short" }) + " МСК"; }
export type DonorSubscription = { id: string; amountKopecks: string; frequency: "daily" | "every_friday" | "monthly"; state: string; nextAt: string | null; firstPayment: string; latestAttempt: { state: string } | null };
export type DonorHistory = { orderId: string; kind: string; status: string; operationState: string | null; amountKopecks: string; paidAmountKopecks: string | null; paidAt: string | null; scheduledAt: string | null };
export type DonorPage<T> = { items: T[]; nextCursor: string | null };
