/**
 * Атрибуция в админке: подписи источников, отчёт по источникам и форма
 * короткой ссылки. Без React — правила проверяются обычными функциями.
 *
 * Шаблоны — зеркало бэкенда: `apps/api/src/short-links/short-links.constants.ts`
 * и `apps/api/src/attribution/attribution.constants.ts`. Форма отвечает
 * вежливым сообщением до запроса, сервер всё равно проверит сам.
 */

import { ADMIN_PATHS } from "./endpoints";
import { withQuery } from "./query";
import type { AttributionModel, HowDidYouHear, ShortLinkBody, SourceGrouping, SourceRow } from "./types";

export const HOW_DID_YOU_HEAR_LABELS: Readonly<Record<HowDidYouHear, string>> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  vk: "ВКонтакте",
  friends: "От знакомых",
  mosque: "В мечети, от имама",
  banner_qr: "Баннер или листовка с QR",
  other: "Другое",
};

/**
 * Человеческие имена частых источников. Остальное показываем как пришло:
 * метку придумал тот, кто делал ссылку, и он её узнает.
 */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  direct: "Прямой заход",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  vk: "ВКонтакте",
  facebook: "Facebook",
  youtube: "YouTube",
  ok: "Одноклассники",
  yandex: "Яндекс",
  google: "Google",
  qr: "QR-код",
};

export const MODEL_OPTIONS: readonly { readonly value: AttributionModel; readonly label: string; readonly hint: string }[] = [
  { value: "last", label: "Последний переход", hint: "Канал, по которому человек пришёл последним перед пожертвованием." },
  { value: "first", label: "Первый переход", hint: "Канал, из которого человек впервые узнал о сборе." },
];

export const GROUPING_OPTIONS: readonly { readonly value: SourceGrouping; readonly label: string }[] = [
  { value: "source", label: "По источнику" },
  { value: "campaign", label: "По кампании" },
  { value: "content", label: "По объявлению" },
  { value: "how_did_you_hear", label: "«Откуда узнали» (переводы)" },
];

export function sourceLabel(source: string, groupBy: SourceGrouping): string {
  if (groupBy === "how_did_you_hear") {
    return source in HOW_DID_YOU_HEAR_LABELS ? HOW_DID_YOU_HEAR_LABELS[source as HowDidYouHear] : source;
  }

  return SOURCE_LABELS[source] ?? source;
}

/** Ключ строки отчёта: источник, кампания и объявление вместе уникальны. */
export function sourceRowKey(row: SourceRow): string {
  return [row.source, row.campaign ?? "", row.content ?? ""].join("|");
}

export function sourcesReportPath(
  period: { readonly from: string; readonly to: string },
  model: AttributionModel,
  groupBy: SourceGrouping,
): string {
  return withQuery(ADMIN_PATHS.donationsBySource, { ...period, model, groupBy });
}

/* ── Форма короткой ссылки ─────────────────────────────────────────────── */

export const SHORT_LINK_SLUG_MAX = 64;
export const SHORT_LINK_TITLE_MAX = 200;
export const SHORT_LINK_PATH_MAX = 256;
export const UTM_VALUE_MAX = 128;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TARGET_PATH_PATTERN = /^\/([A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/;
/** Без `@`: e-mail в метке — персональные данные. */
const UTM_VALUE_PATTERN = /^[\p{L}\p{N} _\-.~+%:/|]+$/u;

export interface ShortLinkForm {
  readonly slug: string;
  readonly title: string;
  readonly targetPath: string;
  readonly utmSource: string;
  readonly utmMedium: string;
  readonly utmCampaign: string;
  readonly utmContent: string;
  readonly utmTerm: string;
  readonly isActive: boolean;
}

export type ShortLinkFormErrors = Partial<Record<keyof ShortLinkForm, string>>;

export type ShortLinkFormCheck =
  | { readonly ok: true; readonly body: ShortLinkBody }
  | { readonly ok: false; readonly errors: ShortLinkFormErrors };

export const EMPTY_SHORT_LINK_FORM: ShortLinkForm = {
  slug: "",
  title: "",
  targetPath: "/",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmContent: "",
  utmTerm: "",
  isActive: true,
};

const UTM_FIELDS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"] as const;

/** Метка так, как её сохранит сервер: без краёв, в нижнем регистре. */
export function normalizeUtm(value: string): string {
  return value.trim().toLowerCase();
}

function utmError(value: string): string | undefined {
  if (value.length > UTM_VALUE_MAX) {
    return `Не длиннее ${UTM_VALUE_MAX} символов.`;
  }

  return value === "" || UTM_VALUE_PATTERN.test(value)
    ? undefined
    : "Только буквы, цифры, пробел и _ - . ~ + % : / |";
}

/**
 * Проверка формы. `isNew` — слаг проверяется и уходит в тело только
 * при создании: у существующей ссылки он уже напечатан в QR.
 */
export function checkShortLinkForm(form: ShortLinkForm, isNew: boolean): ShortLinkFormCheck {
  const errors: ShortLinkFormErrors = {};
  const slug = form.slug.trim();
  const title = form.title.trim();
  const targetPath = form.targetPath.trim() === "" ? "/" : form.targetPath.trim();
  const utm = Object.fromEntries(UTM_FIELDS.map((key) => [key, normalizeUtm(form[key])])) as Record<
    (typeof UTM_FIELDS)[number],
    string
  >;

  if (isNew && (slug === "" || slug.length > SHORT_LINK_SLUG_MAX || !SLUG_PATTERN.test(slug))) {
    errors.slug = "Строчные латинские буквы и цифры, дефис между ними: banner-mosque, tg-oct.";
  }

  if (title === "" || title.length > SHORT_LINK_TITLE_MAX) {
    errors.title = "Подпишите ссылку, чтобы потом её узнать: «Баннер у входа».";
  }

  if (targetPath.length > SHORT_LINK_PATH_MAX || !TARGET_PATH_PATTERN.test(targetPath)) {
    errors.targetPath = "Путь на сайте: /, /02/, /novosti/ — без домена и знака «?».";
  }

  if (utm.utmSource === "") {
    errors.utmSource = "Источник обязателен: ради него ссылку и заводят.";
  }

  for (const key of UTM_FIELDS) {
    const error = errors[key] ?? utmError(utm[key]);

    if (error !== undefined) {
      errors[key] = error;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const orNull = (value: string): string | null => (value === "" ? null : value);

  return {
    ok: true,
    body: {
      ...(isNew ? { slug } : {}),
      title,
      targetPath,
      utmSource: utm.utmSource,
      utmMedium: orNull(utm.utmMedium),
      utmCampaign: orNull(utm.utmCampaign),
      utmContent: orNull(utm.utmContent),
      utmTerm: orNull(utm.utmTerm),
      isActive: form.isActive,
    },
  };
}
