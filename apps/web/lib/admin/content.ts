/**
 * Блоки «Тексты сайта» (API.md §10): значения по умолчанию из хардкода
 * и проверки по тем же лимитам, что у сервера.
 *
 * Блок уходит целиком (`PUT`), лишнее поле — 400, поэтому тело собирается
 * явным перечислением полей, а не спредом формы. Хадисов, слогана
 * и юридических реквизитов организации здесь нет (D-10).
 */

import { ABOUT, HERO } from "@/lib/content";
import { BANK_DETAILS, ORGANIZATION } from "@/lib/organization";

import type { AboutBlock, ContactsBlock, ContentBlocks, ContentKey, FaqBlock, HeroBlock, RequisitesBlock } from "./types";

/** Ошибки по пути поля: `title`, `trust.2`, `facts.1.value`, `items.0.answer`. */
export type BlockErrors = Readonly<Record<string, string>>;

export type BlockCheck<T> = { readonly ok: true; readonly body: T } | { readonly ok: false; readonly errors: BlockErrors };

/* ── Значения, когда блок ещё не заполнен (GET его не вернул) ───────── */

export const DEFAULT_BLOCKS: ContentBlocks = {
  hero: {
    badge: HERO.badge,
    title: HERO.title,
    lede: HERO.lede,
    ledeShort: HERO.ledeShort,
    trust: [...HERO.trust],
    renderMediaId: null,
    renderCaption: HERO.renderCaption,
    helpButton: HERO.helpButton,
  },
  about: {
    eyebrow: ABOUT.eyebrow,
    title: ABOUT.title,
    text: ABOUT.text,
    facadeMediaId: null,
    facadeCaption: ABOUT.facadeCaption,
    facts: ABOUT.facts.map((fact) => ({ value: fact.value, unit: fact.unit ?? null, label: fact.label })),
  },
  requisites: {
    accountNumber: BANK_DETAILS.accountNumber,
    bankName: BANK_DETAILS.bankName,
    bik: BANK_DETAILS.bik,
    correspondentAccount: BANK_DETAILS.correspondentAccount,
    kpp: BANK_DETAILS.kpp,
    sbpQrMediaId: null,
  },
  contacts: {
    phone: ORGANIZATION.phone,
    email: ORGANIZATION.email,
    telegramChannel: ORGANIZATION.telegramChannel,
    mosqueAddress: ORGANIZATION.mosqueAddress,
  },
  faq: { items: [] },
};

export const CONTENT_KEYS: readonly ContentKey[] = ["hero", "about", "contacts", "requisites", "faq"];

/* ── Помощники ───────────────────────────────────────────────────────── */

class Collector {
  readonly errors: Record<string, string> = {};

  /** Обязательная строка: обрезанная, `min…max` символов. */
  required(path: string, value: string, max: number, min = 1): string {
    const trimmed = value.trim();

    if (trimmed.length < min || trimmed.length > max) {
      this.errors[path] = min > 0 ? `От ${min} до ${max} символов.` : `Не длиннее ${max} символов.`;
    }

    return trimmed;
  }

  /** Необязательная строка: пустая → `null`. */
  optional(path: string, value: string | null, max: number): string | null {
    const trimmed = (value ?? "").trim();

    if (trimmed.length > max) {
      this.errors[path] = `Не длиннее ${max} символов.`;
    }

    return trimmed === "" ? null : trimmed;
  }

  /** Необязательное поле по шаблону; пустое → `null`. */
  pattern(path: string, value: string | null, regex: RegExp, message: string): string | null {
    const trimmed = (value ?? "").trim();

    if (trimmed !== "" && !regex.test(trimmed)) {
      this.errors[path] = message;
    }

    return trimmed === "" ? null : trimmed;
  }

  fail(path: string, message: string): void {
    this.errors[path] = message;
  }

  result<T>(body: T): BlockCheck<T> {
    return Object.keys(this.errors).length > 0 ? { ok: false, errors: this.errors } : { ok: true, body };
  }
}

/* ── Проверки блоков ─────────────────────────────────────────────────── */

export const HERO_TRUST_MAX = 5;
export const ABOUT_FACTS_MAX = 8;
export const FAQ_ITEMS_MAX = 50;

export function checkHero(block: HeroBlock): BlockCheck<HeroBlock> {
  const c = new Collector();

  if (block.trust.length < 1 || block.trust.length > HERO_TRUST_MAX) {
    c.fail("trust", `Пунктов доверия — от 1 до ${HERO_TRUST_MAX}.`);
  }

  return c.result<HeroBlock>({
    badge: c.required("badge", block.badge, 80),
    title: c.required("title", block.title, 160),
    lede: c.required("lede", block.lede, 600),
    ledeShort: c.required("ledeShort", block.ledeShort, 300),
    trust: block.trust.map((item, index) => c.required(`trust.${index}`, item, 80)),
    renderMediaId: block.renderMediaId,
    renderCaption: c.required("renderCaption", block.renderCaption, 160, 0),
    helpButton: c.required("helpButton", block.helpButton, 40),
  });
}

export function checkAbout(block: AboutBlock): BlockCheck<AboutBlock> {
  const c = new Collector();

  if (block.facts.length > ABOUT_FACTS_MAX) {
    c.fail("facts", `Фактов — не больше ${ABOUT_FACTS_MAX}.`);
  }

  return c.result<AboutBlock>({
    eyebrow: c.required("eyebrow", block.eyebrow, 60, 0),
    title: c.required("title", block.title, 160),
    text: c.optional("text", block.text, 3000),
    facadeMediaId: block.facadeMediaId,
    facadeCaption: c.required("facadeCaption", block.facadeCaption, 160, 0),
    facts: block.facts.map((fact, index) => ({
      value: c.optional(`facts.${index}.value`, fact.value, 40),
      unit: c.optional(`facts.${index}.unit`, fact.unit, 16),
      label: c.optional(`facts.${index}.label`, fact.label, 120),
    })),
  });
}

/** Счёт и к/с — 20 цифр, БИК и КПП — 9. Пробелы при вставке из выписки убираем. */
export function digitsOnly(value: string | null): string | null {
  const digits = (value ?? "").replace(/[\s-]/g, "");

  return digits === "" ? null : digits;
}

export function checkRequisites(block: RequisitesBlock): BlockCheck<RequisitesBlock> {
  const c = new Collector();

  return c.result<RequisitesBlock>({
    accountNumber: c.pattern("accountNumber", digitsOnly(block.accountNumber), /^\d{20}$/, "Ровно 20 цифр."),
    bankName: c.optional("bankName", block.bankName, 200),
    bik: c.pattern("bik", digitsOnly(block.bik), /^\d{9}$/, "Ровно 9 цифр."),
    correspondentAccount: c.pattern(
      "correspondentAccount",
      digitsOnly(block.correspondentAccount),
      /^\d{20}$/,
      "Ровно 20 цифр.",
    ),
    kpp: c.pattern("kpp", digitsOnly(block.kpp), /^\d{9}$/, "Ровно 9 цифр."),
    sbpQrMediaId: block.sbpQrMediaId,
  });
}

export function checkContacts(block: ContactsBlock): BlockCheck<ContactsBlock> {
  const c = new Collector();
  const telegram = (block.telegramChannel ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");

  return c.result<ContactsBlock>({
    phone: c.pattern("phone", block.phone, /^[\d\s()+-]{5,30}$/, "Цифры, пробелы, скобки, + и -; от 5 до 30 знаков."),
    email: c.pattern("email", block.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Проверьте адрес почты."),
    telegramChannel: c.pattern(
      "telegramChannel",
      telegram,
      /^[A-Za-z0-9_]{5,32}$/,
      "Имя канала без @: латиница, цифры и _, от 5 до 32 знаков.",
    ),
    mosqueAddress: c.optional("mosqueAddress", block.mosqueAddress, 300),
  });
}

export function checkFaq(block: FaqBlock): BlockCheck<FaqBlock> {
  const c = new Collector();

  if (block.items.length > FAQ_ITEMS_MAX) {
    c.fail("items", `Вопросов — не больше ${FAQ_ITEMS_MAX}.`);
  }

  return c.result<FaqBlock>({
    items: block.items.map((item, index) => ({
      question: c.required(`items.${index}.question`, item.question, 300),
      answer: c.required(`items.${index}.answer`, item.answer, 3000),
    })),
  });
}
