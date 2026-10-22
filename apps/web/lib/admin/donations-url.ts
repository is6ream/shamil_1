/**
 * Список пожертвований ↔ адресная строка.
 *
 * Фильтры, страница, открытая карточка и «Внести поступление» живут
 * в адресе: ссылку на выборку можно отправить бухгалтеру, «Назад» после
 * карточки возвращает к той же странице списка, быстрое действие «Обзора»
 * ведёт сразу в форму (`?manual=1`).
 *
 * Поиск `q` — исключение: по нему ищут имя и телефон (ПДн), им не место
 * в истории браузера и в логах. Он не читается из адреса и не пишется в него.
 *
 * Адрес — недоверенный ввод: невалидное значение отбрасывается по одному
 * полю, а не ломает весь экран. Значения по умолчанию в адрес не пишутся.
 */

import { EMPTY_DONATION_FILTERS } from "./donations";
import type { DonationFilters, DonationSort } from "./donations";
import { kopecksToRublesInput, rublesToKopecks } from "./money";
import type { DonationStatus } from "./types";

export interface DonationsUrlState {
  /** `q` здесь всегда пустой. */
  readonly filters: DonationFilters;
  /** С единицы. */
  readonly page: number;
  /** Карточка поверх списка. */
  readonly openId: string | null;
  readonly isManualOpen: boolean;
}

export const EMPTY_DONATIONS_URL: DonationsUrlState = {
  filters: EMPTY_DONATION_FILTERS,
  page: 1,
  openId: null,
  isManualOpen: false,
};

const STATUSES: readonly DonationStatus[] = ["pending", "paid", "failed"];
const SORTS: readonly DonationSort[] = ["createdAt", "paidAt", "amount"];
const MAX_PAGE = 10_000;
const UTM_MAX = 100;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[a-z_]{1,32}$/;
const SLUG = /^[a-z0-9-]{1,32}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = /^[1-9]\d{0,4}$/;

/** Ключи адреса — короче и понятнее человеку, чем поля API. */
const KEYS = {
  status: "status",
  from: "from",
  to: "to",
  dateField: "date",
  method: "method",
  provider: "provider",
  minRubles: "min",
  maxRubles: "max",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  regionSlug: "region",
  sort: "sort",
  order: "order",
  page: "page",
  openId: "donation",
  manual: "manual",
} as const;

/** Только `get` — подходит и `URLSearchParams`, и `ReadonlyURLSearchParams` из Next. */
interface ParamsReader {
  get(name: string): string | null;
}

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function date(value: string | null): string {
  return value !== null && isRealDate(value) ? value : "";
}

function code(value: string | null): string {
  return value !== null && CODE.test(value) ? value : "";
}

function slug(value: string | null): string {
  return value !== null && SLUG.test(value) ? value : "";
}

/** Сумма из адреса → как в поле формы; не сумма — пусто. */
function rubles(value: string | null): string {
  const kopecks = value === null ? null : rublesToKopecks(value);

  return kopecks === null ? "" : kopecksToRublesInput(kopecks);
}

/**
 * Метка — как её хранит бэкенд (CLAUDE.md, атрибуция): без пробелов
 * по краям, нижний регистр, без `@` — похожее на e-mail не принимаем.
 */
function utm(value: string | null): string {
  const normalized = (value ?? "").trim().toLowerCase();

  return normalized.length <= UTM_MAX && !normalized.includes("@") ? normalized : "";
}

function page(value: string | null): number {
  if (value === null || !PAGE.test(value)) {
    return 1;
  }

  const parsed = Number(value);

  return parsed <= MAX_PAGE ? parsed : 1;
}

export function readDonationsUrl(params: ParamsReader): DonationsUrlState {
  const sort = oneOf(params.get(KEYS.sort), SORTS) ?? EMPTY_DONATION_FILTERS.sort;
  const order = oneOf(params.get(KEYS.order), ["asc", "desc"] as const) ?? EMPTY_DONATION_FILTERS.order;
  const openId = params.get(KEYS.openId);

  return {
    filters: {
      ...EMPTY_DONATION_FILTERS,
      status: oneOf(params.get(KEYS.status), STATUSES) ?? "",
      from: date(params.get(KEYS.from)),
      to: date(params.get(KEYS.to)),
      dateField: params.get(KEYS.dateField) === "paid" ? "paid" : "created",
      method: code(params.get(KEYS.method)),
      provider: code(params.get(KEYS.provider)),
      minRubles: rubles(params.get(KEYS.minRubles)),
      maxRubles: rubles(params.get(KEYS.maxRubles)),
      utmSource: utm(params.get(KEYS.utmSource)),
      utmMedium: utm(params.get(KEYS.utmMedium)),
      utmCampaign: utm(params.get(KEYS.utmCampaign)),
      regionSlug: slug(params.get(KEYS.regionSlug)),
      sort,
      order,
    },
    page: page(params.get(KEYS.page)),
    openId: openId !== null && UUID.test(openId) ? openId : null,
    isManualOpen: params.get(KEYS.manual) === "1",
  };
}

/** Все поля состояния ключами адреса, включая пустые и значения по умолчанию. */
function toParams({ filters, page: pageNo, openId, isManualOpen }: DonationsUrlState): URLSearchParams {
  return new URLSearchParams([
    [KEYS.status, filters.status],
    [KEYS.from, filters.from],
    [KEYS.to, filters.to],
    [KEYS.dateField, filters.dateField],
    [KEYS.method, filters.method],
    [KEYS.provider, filters.provider],
    [KEYS.minRubles, filters.minRubles],
    [KEYS.maxRubles, filters.maxRubles],
    [KEYS.utmSource, filters.utmSource],
    [KEYS.utmMedium, filters.utmMedium],
    [KEYS.utmCampaign, filters.utmCampaign],
    [KEYS.regionSlug, filters.regionSlug],
    [KEYS.sort, filters.sort],
    [KEYS.order, filters.order],
    [KEYS.page, String(pageNo)],
    [KEYS.openId, openId ?? ""],
    [KEYS.manual, isManualOpen ? "1" : ""],
  ]);
}

const DEFAULTS = toParams(EMPTY_DONATIONS_URL);

/**
 * Состояние → `?…` (или пустая строка). Сначала та же очистка, что при
 * чтении, — поэтому `read(write(x))` не теряет и не придумывает значений.
 * Пустое и значения по умолчанию не пишутся; `date` — только при периоде.
 */
export function writeDonationsUrl(state: DonationsUrlState): string {
  const clean = readDonationsUrl(toParams(state));
  const hasRange = clean.filters.from !== "" || clean.filters.to !== "";
  const out = new URLSearchParams();

  for (const [key, value] of toParams(clean)) {
    const isDefault = value === "" || value === DEFAULTS.get(key);

    if (!isDefault && (key !== KEYS.dateField || hasRange)) {
      out.set(key, value);
    }
  }

  const query = out.toString();

  return query === "" ? "" : `?${query}`;
}
