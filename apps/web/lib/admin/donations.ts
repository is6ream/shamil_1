/**
 * Фильтры списка пожертвований → query `GET /admin/donations` (API.md §13).
 *
 * Состояние фильтров живёт в компоненте, не в адресной строке: поиск
 * по имени и телефону — это ПДн, им не место в истории браузера.
 */

import { LIMITS } from "./endpoints";
import { checkRublesInput, rublesToKopecks } from "./money";
import type { QueryValue } from "./query";
import { ufaDateTimeInputToIso, ufaDayKey, ufaRangeToIso } from "./time";
import type { AdminDonation, DonationStatus, ManualDonationBody, ManualMethod } from "./types";

export type DonationSort = "createdAt" | "paidAt" | "amount";

export interface DonationFilters {
  readonly status: DonationStatus | "";
  /** Даты по Уфе, `ГГГГ-ММ-ДД`, обе включительно. */
  readonly from: string;
  readonly to: string;
  readonly dateField: "created" | "paid";
  readonly method: string;
  readonly provider: string;
  /** Рубли, как набрал человек. */
  readonly minRubles: string;
  readonly maxRubles: string;
  readonly utmSource: string;
  readonly utmMedium: string;
  readonly utmCampaign: string;
  readonly regionSlug: string;
  readonly q: string;
  readonly sort: DonationSort;
  readonly order: "desc" | "asc";
}

export const EMPTY_DONATION_FILTERS: DonationFilters = {
  status: "",
  from: "",
  to: "",
  dateField: "created",
  method: "",
  provider: "",
  minRubles: "",
  maxRubles: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  regionSlug: "",
  q: "",
  sort: "createdAt",
  order: "desc",
};

export type FiltersCheck =
  | { readonly ok: true; readonly params: Readonly<Record<string, QueryValue>> }
  | { readonly ok: false; readonly errors: Readonly<Partial<Record<keyof DonationFilters, string>>> };

function parseBound(raw: string): string | null | undefined {
  if (raw.trim() === "") {
    return undefined;
  }

  return rublesToKopecks(raw);
}

/**
 * Фильтры → параметры запроса. Пустое не отправляется (лишний или пустой
 * параметр — 400), значения по умолчанию сервера (`dateField=created`,
 * `sort=createdAt`, `order=desc`) — тоже.
 */
export function donationFiltersToParams(filters: DonationFilters): FiltersCheck {
  const errors: Partial<Record<keyof DonationFilters, string>> = {};
  const min = parseBound(filters.minRubles);
  const max = parseBound(filters.maxRubles);

  if (min === null) {
    errors.minRubles = "Сумма цифрами, например 500";
  }

  if (max === null) {
    errors.maxRubles = "Сумма цифрами, например 5000";
  }

  if (typeof min === "string" && typeof max === "string" && BigInt(min) > BigInt(max)) {
    errors.maxRubles = "«До» меньше, чем «от»";
  }

  if (filters.from !== "" && filters.to !== "" && filters.from > filters.to) {
    errors.to = "Конец периода раньше начала";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const range = ufaRangeToIso(filters.from, filters.to);
  const hasRange = range.from !== undefined || range.to !== undefined;

  return {
    ok: true,
    params: {
      status: filters.status,
      from: range.from,
      to: range.to,
      dateField: hasRange && filters.dateField === "paid" ? "paid" : undefined,
      method: filters.method,
      provider: filters.provider,
      minKopecks: min ?? undefined,
      maxKopecks: max ?? undefined,
      utmSource: filters.utmSource,
      utmMedium: filters.utmMedium,
      utmCampaign: filters.utmCampaign,
      regionSlug: filters.regionSlug,
      q: filters.q,
      sort: filters.sort === "createdAt" ? undefined : filters.sort,
      order: filters.order === "desc" ? undefined : filters.order,
    },
  };
}

/** Сколько фильтров выбрано — для подписи кнопки «Фильтры (3)». */
export function countActiveFilters(filters: DonationFilters): number {
  const keys: readonly (keyof DonationFilters)[] = [
    "status",
    "from",
    "to",
    "method",
    "provider",
    "minRubles",
    "maxRubles",
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "regionSlug",
    "q",
  ];

  return keys.filter((key) => String(filters[key]).trim() !== "").length;
}

/** Оплачено не столько, сколько заказано — выделяем в списке. */
export function isAmountMismatch(donation: Pick<AdminDonation, "amountKopecks" | "paidAmountKopecks">): boolean {
  return donation.paidAmountKopecks !== null && donation.paidAmountKopecks !== donation.amountKopecks;
}

/** Подтвердить перевод можно только у ручного провайдера в ожидании (§13). */
export function canConfirmTransfer(donation: Pick<AdminDonation, "provider" | "status">): boolean {
  return donation.provider === "manual" && donation.status === "pending";
}

/** Имя файла выгрузки: `donations-ГГГГ-ММ-ДД.csv` (дата по Уфе). */
export function exportFileName(now: number = Date.now()): string {
  return `donations-${ufaDayKey(now)}.csv`;
}

export const MANUAL_COMMENT_MIN = 3;
export const MANUAL_COMMENT_MAX = 500;
export const DONOR_NAME_MAX = 120;

export const MANUAL_MAX_KOPECKS = LIMITS.manualMaxKopecks;

/* ── Ручное поступление (POST /admin/donations/manual) ───────────────── */

export interface ManualDonationForm {
  readonly amount: string;
  readonly method: ManualMethod;
  readonly comment: string;
  /** `datetime-local` по Уфе. */
  readonly paidAt: string;
  /** Не трогали дату — не отправляем, сервер поставит «сейчас» по своим часам. */
  readonly isPaidAtTouched: boolean;
  readonly regionSlug: string;
  readonly isAnonymous: boolean;
  readonly donorName: string;
}

export type ManualFormErrors = Partial<Record<keyof ManualDonationForm, string>>;

export type ManualFormCheck =
  | { readonly ok: true; readonly body: Omit<ManualDonationBody, "idempotencyKey"> }
  | { readonly ok: false; readonly errors: ManualFormErrors };

/** Похоже на телефон: 7+ цифр подряд с разделителями. Только предупреждение. */
const PHONE_LIKE = /(?:\+?\d[\s()-]*){7,}/;

export function looksLikePersonalData(comment: string): boolean {
  return PHONE_LIKE.test(comment);
}

export function checkManualDonation(form: ManualDonationForm, now: number = Date.now()): ManualFormCheck {
  const errors: ManualFormErrors = {};
  const amount = checkRublesInput(form.amount, { max: MANUAL_MAX_KOPECKS, maxLabel: "240 000 000 ₽" });
  const comment = form.comment.trim();
  const donorName = form.donorName.trim();
  const paidAt = form.isPaidAtTouched ? ufaDateTimeInputToIso(form.paidAt) : null;

  if (!amount.ok) {
    errors.amount = amount.error;
  }

  if (comment.length < MANUAL_COMMENT_MIN || comment.length > MANUAL_COMMENT_MAX) {
    errors.comment = `Комментарий — от ${MANUAL_COMMENT_MIN} до ${MANUAL_COMMENT_MAX} символов.`;
  }

  if (form.isPaidAtTouched && paidAt === null) {
    errors.paidAt = "Укажите дату и время поступления.";
  } else if (paidAt !== null && Date.parse(paidAt) > now) {
    errors.paidAt = "Дата поступления не может быть в будущем.";
  }

  if (!form.isAnonymous && donorName === "") {
    errors.donorName = "Впишите подпись или отметьте «Анонимно».";
  } else if (donorName.length > DONOR_NAME_MAX) {
    errors.donorName = `Подпись — не длиннее ${DONOR_NAME_MAX} символов.`;
  }

  if (!amount.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      amountKopecks: amount.kopecks,
      method: form.method,
      comment,
      ...(paidAt === null ? {} : { paidAt }),
      ...(form.regionSlug === "" ? {} : { regionSlug: form.regionSlug }),
      isAnonymous: form.isAnonymous,
      ...(form.isAnonymous ? {} : { donorName }),
    },
  };
}
