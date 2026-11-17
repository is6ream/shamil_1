export const frequencies = ['daily', 'every_friday', 'monthly'] as const;
export type Frequency = typeof frequencies[number];

// Europe/Moscow (UTC+3 under the schedule approved for this version).
const moscowOffset = 3 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
export const localDate = (date: Date) => new Date(date.getTime() + moscowOffset).toISOString().slice(0, 10);
export const chargeAt = (date: string) => new Date(date + 'T10:00:00+03:00');

export function nextDate(date: string, frequency: Frequency, anchor: number): string {
  const day = new Date(date + 'T00:00:00Z');
  if (frequency === 'monthly') {
    const year = day.getUTCFullYear();
    const month = day.getUTCMonth();
    const last = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
    return new Date(Date.UTC(year, month + 1, Math.min(anchor, last))).toISOString().slice(0, 10);
  }
  const days = frequency === 'daily' ? 1 : (5 - day.getUTCDay() + 7) % 7 || 7;
  return new Date(day.getTime() + days * dayMs).toISOString().slice(0, 10);
}

export function periodKey(date: string, frequency: Frequency): string {
  return frequency === 'monthly' ? date.slice(0, 7) : date;
}
