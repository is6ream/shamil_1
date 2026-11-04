/**
 * «Моя помощь»: группировка по дням и подписи строк. Чистые функции —
 * проверяются без рендера (`history.test.ts`).
 *
 * Время — по Уфе (`Asia/Yekaterinburg`), как вся лента сайта и итог года
 * на бэкенде: день пожертвования не должен зависеть от того, где человек
 * открыл кабинет.
 */

import { CAMPAIGN_TIME_ZONE } from "@/lib/format";

import type { DonationKind, DonorHistoryItem, HistoryStatus, TaxCertificateStatus } from "./types";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/** `ГГГГ-ММ-ДД` по Уфе — ключ группы и сравнение «сегодня/вчера». */
export function ufaDay(time: number | string): string {
  return new Date(time).toLocaleDateString("en-CA", { timeZone: CAMPAIGN_TIME_ZONE });
}

/** Момент, по которому строка встаёт в историю: оплата, а без неё — создание. */
export function happenedAt(item: DonorHistoryItem): string {
  return item.paidAt ?? item.createdAt;
}

/** «Сегодня», «Вчера», «25 окт» (и год, если не текущий). */
export function dayLabel(day: string, now: number): string {
  if (day === ufaDay(now)) {
    return "Сегодня";
  }

  // В Екатеринбургском поясе нет летнего времени: сутки всегда 24 ч.
  if (day === ufaDay(now - MS_IN_DAY)) {
    return "Вчера";
  }

  // Полдень UTC — тот же календарный день в любом поясе ±12 ч.
  const date = new Date(`${day}T12:00:00Z`);
  const label = date
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(".", "");

  return day.slice(0, 4) === ufaDay(now).slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
}

export interface HistoryDay {
  readonly day: string;
  readonly items: readonly DonorHistoryItem[];
  /** Сумма успешных за день, копейки. */
  readonly paidTotalKopecks: bigint;
}

/**
 * Группы по дням в порядке ответа (сервер отдаёт новые сверху). Страницы
 * «Загрузить ещё» склеиваются до группировки: день на стыке страниц —
 * одна группа, а не две.
 */
export function groupByDay(items: readonly DonorHistoryItem[]): readonly HistoryDay[] {
  const days: { day: string; items: DonorHistoryItem[]; paidTotalKopecks: bigint }[] = [];

  for (const item of items) {
    const day = ufaDay(happenedAt(item));
    const last = days.at(-1);
    const paid = item.status === "paid" ? BigInt(item.amountKopecks) : 0n;

    if (last !== undefined && last.day === day) {
      last.items.push(item);
      last.paidTotalKopecks += paid;
    } else {
      days.push({ day, items: [item], paidTotalKopecks: paid });
    }
  }

  return days;
}

/** Способы оплаты в формулировках кабинета (промт, раздел «Моя помощь»). */
const METHOD_LABELS: Readonly<Record<string, string>> = {
  sbp: "СБП",
  card: "Банковская карта",
  sberpay: "SberPay",
  tpay: "T-Pay",
  bank_transfer: "Расчётный счёт",
  cash: "Наличными",
};

export function methodLabel(method: string | null): string {
  return method === null ? "—" : (METHOD_LABELS[method] ?? "Другой способ");
}

export const KIND_LABELS: Readonly<Record<DonationKind, string>> = {
  ONE_TIME: "Разово",
  RECURRING: "Автоплатёж",
};

export const STATUS_LABELS: Readonly<Record<HistoryStatus, string>> = {
  paid: "Успешно",
  failed: "Ошибка",
};

export const CERTIFICATE_STATUS_LABELS: Readonly<Record<TaxCertificateStatus, string>> = {
  NEW: "Заявка принята",
  IN_PROGRESS: "Готовим справку",
  DONE: "Справка готова",
};

/** «Сегодня, 14:32» — время строки по Уфе. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CAMPAIGN_TIME_ZONE,
  });
}
