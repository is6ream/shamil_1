/**
 * Состояние формы доната и его проверка.
 *
 * Здесь нет React: правила, по которым форма считается заполненной,
 * проверяются как обычные функции. Клиент валидирует ТОЛЬКО формат —
 * сумму списания назначает сервер, и это не дублирование проверок,
 * а разные задачи: тут вежливое сообщение, там деньги.
 */

import type { DonationChannel } from "@/lib/api/donation-body";
import type { RegionSource } from "@/lib/api/types";
import { parseRublesInput } from "@/lib/money";
import { MAX_DONATION_RUBLES, MIN_DONATION_RUBLES } from "@/lib/site";

/** Пресеты сумм. 100 ₽ обязателен: он совпадает со слоганом. */
export const AMOUNT_PRESETS_RUBLES = [100, 500, 1000] as const;

/**
 * Способ онлайн-оплаты. Бэкенду НЕ передаётся: в `CreateDonationDto` поля
 * метода нет, конкретный способ выбирается уже на стороне Robokassa.
 * Список нужен, чтобы человек видел, чем он может заплатить, до перехода.
 */
export type OnlineMethodId = "sbp" | "card" | "sberpay" | "tpay" | "kaspi" | "mbank";

export interface DonationFormState {
  /** Онлайн или перевод по реквизитам. В запрос пока не уходит. */
  readonly channel: DonationChannel;
  /** Сырой ввод суммы — человек может печатать «1 000 ₽». */
  readonly amountInput: string;
  /** Выбранный пресет либо `null`, если сумма своя. */
  readonly selectedPreset: number | null;
  readonly onlineMethod: OnlineMethodId;
  readonly isAnonymous: boolean;
  readonly donorName: string;
  readonly phone: string;
  readonly personalDataConsent: boolean;
  /**
   * Что человек выбрал в селекторе. `null` — не трогал его вовсе, и тогда
   * действует регион из ссылки. Отдельное «не трогал» нужно, чтобы ссылка
   * не перебивала осознанный выбор и наоборот.
   */
  readonly regionChoice: string | null;
  /** Honeypot. У человека всегда пустой. */
  readonly antispam: string;
}

/** Регион, который уйдёт в запрос, и то, как он там оказался. */
export interface ResolvedRegion {
  readonly slug: string;
  readonly source: RegionSource;
}

/**
 * Выбор в форме важнее ссылки: человек, поменявший регион руками, знает
 * о себе больше, чем тот, кто дал ему ссылку.
 */
export function resolveRegion(
  state: DonationFormState,
  linkSlug: string | null,
): ResolvedRegion {
  if (state.regionChoice !== null) {
    return { slug: state.regionChoice, source: "form" };
  }

  return linkSlug === null ? { slug: "", source: "form" } : { slug: linkSlug, source: "link" };
}

export const INITIAL_FORM_STATE: DonationFormState = {
  channel: "online",
  // 100 ₽ по умолчанию: сумма из слогана. Вариант «1 000 ₽ поднимает средний
  // чек» остаётся открытым вопросом к заказчику (docs/design/handoff.md §10).
  amountInput: String(MIN_DONATION_RUBLES),
  selectedPreset: MIN_DONATION_RUBLES,
  onlineMethod: "sbp",
  // Включена по умолчанию: садака — скрытое поклонение (блок 9 ТЗ).
  isAnonymous: true,
  donorName: "",
  phone: "",
  personalDataConsent: false,
  regionChoice: null,
  antispam: "",
};

/** Поля, у которых бывает своё сообщение об ошибке. */
export type DonationField = "amount" | "donorName" | "phone" | "personalDataConsent";

export type FieldErrors = Partial<Record<DonationField, string>>;

/** Максимальная длина имени — зеркало `@MaxLength(120)` в DTO. */
const NAME_MAX_LENGTH = 120;

/** E.164 — тот же паттерн, что в DTO и в CHECK `donation_contact_phone_e164`. */
const PHONE_E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/**
 * Приводит телефон к E.164.
 *
 * Люди набирают «8 (917) 123-45-67» — это правильный российский номер
 * и неправильный E.164. Отклонять его как «неверный формат» значит терять
 * донат на ровном месте, поэтому разделители убираются, а ведущая
 * восьмёрка заменяется на +7.
 */
export function normalizePhone(raw: string): string {
  const digitsAndPlus = raw.replace(/[^\d+]/g, "");

  if (digitsAndPlus === "") {
    return "";
  }

  if (digitsAndPlus.startsWith("+")) {
    return `+${digitsAndPlus.slice(1).replace(/\D/g, "")}`;
  }

  const digits = digitsAndPlus.replace(/\D/g, "");

  if (digits.startsWith("8") && digits.length === 11) {
    return `+7${digits.slice(1)}`;
  }

  return `+${digits}`;
}

/** Сумма в рублях либо `null`, если поле пустое или это не число. */
export function selectAmountRubles(state: DonationFormState): number | null {
  return parseRublesInput(state.amountInput);
}

/**
 * Уходит ли имя как `fullName` — имя для сверки поступления по реквизитам.
 *
 * Важная оговорка: провайдер выбирается глобально через `PAYMENT_PROVIDER`,
 * поэтому таб — это намерение человека, а не гарантия маршрута. Если сервер
 * работает в режиме ручного перевода, по реквизитам уйдут и те, кто выбрал
 * «Онлайн». Имя для сверки от этого не становится вредным — просто
 * не у всех оно будет.
 */
export function sendsFullName(state: DonationFormState): boolean {
  return state.channel === "transfer" && state.donorName.trim() !== "";
}

/** Нужно ли согласие на обработку ПДн: есть телефон или имя для сверки. */
export function requiresPersonalDataConsent(state: DonationFormState): boolean {
  return state.phone.trim() !== "" || sendsFullName(state);
}

/**
 * Проверка формата. Пустой объект — можно отправлять.
 *
 * Регион не проверяется намеренно: донат без региона обязан проходить,
 * платёж важнее статистики (CLAUDE.md).
 */
export function validate(state: DonationFormState): FieldErrors {
  const errors: FieldErrors = {};
  const amount = selectAmountRubles(state);

  if (amount === null) {
    errors.amount = "Введите сумму пожертвования";
  } else if (amount < MIN_DONATION_RUBLES) {
    errors.amount = `Минимальная сумма — ${MIN_DONATION_RUBLES} ₽`;
  } else if (amount > MAX_DONATION_RUBLES) {
    errors.amount =
      "Такую сумму онлайн не провести — переведите её по реквизитам, вкладка «Расчётный счёт»";
  }

  if (!state.isAnonymous && state.donorName.trim().length > NAME_MAX_LENGTH) {
    errors.donorName = `Не длиннее ${NAME_MAX_LENGTH} символов`;
  }

  const phone = state.phone.trim();

  if (phone !== "" && !PHONE_E164_PATTERN.test(normalizePhone(phone))) {
    errors.phone = "Проверьте номер: нужен формат +7 917 123-45-67";
  }

  if (requiresPersonalDataConsent(state) && !state.personalDataConsent) {
    // Бэкенд ответит на это 400 и будет прав: без согласия он не создаёт
    // строку с ПДн вовсе. Ловим здесь, чтобы человек увидел причину
    // рядом с галочкой, а не общей ошибкой внизу формы.
    errors.personalDataConsent = "Без согласия мы не можем сохранить имя и телефон";
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
