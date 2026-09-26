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
import { groupDigits } from "@/lib/format";
import { parseRublesInput } from "@/lib/money";
import { MAX_DONATION_RUBLES, MIN_DONATION_RUBLES } from "@/lib/site";

/** Пресеты сумм (макет v2). 100 ₽ обязателен: он совпадает со слоганом. */
export const AMOUNT_PRESETS_RUBLES = [100, 500, 1000, 5000] as const;

/**
 * Способ онлайн-оплаты. Бэкенду НЕ передаётся: в `CreateDonationDto` поля
 * метода нет, конкретный способ выбирается уже на стороне Robokassa.
 * Список нужен, чтобы человек видел, чем он может заплатить, до перехода.
 *
 * Kaspi и Mbank на главной макета v2 не показываются: договоров с банками
 * ещё нет, а Robokassa их не закрывает (docs/payments-setup.md).
 *
 * TODO(api): передавать способ провайдеру, когда DTO его примет.
 */
export type OnlineMethodId = "sbp" | "card" | "sberpay" | "tpay";

/**
 * Как часто жертвовать. Живёт только в состоянии формы: автоплатежа в MVP
 * нет, и поля `recurrence` в `CreateDonationDto` тоже — отправка дала бы
 * 400 от `forbidNonWhitelisted`. Любой выбор сейчас проходит разовым
 * пожертвованием, форма честно об этом пишет.
 *
 * TODO(api): регулярные платежи — токенизация карты у Robokassa.
 */
export type Recurrence = "once" | "daily" | "weekly" | "monthly";

export interface DonationFormState {
  /** Онлайн или перевод по реквизитам. В запрос пока не уходит. */
  readonly channel: DonationChannel;
  /** Сырой ввод суммы — человек может печатать «1 000 ₽». */
  readonly amountInput: string;
  /** Выбранный пресет либо `null`, если сумма своя. */
  readonly selectedPreset: number | null;
  readonly onlineMethod: OnlineMethodId;
  readonly recurrence: Recurrence;
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
  recurrence: "once",
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
    errors.amount = "Такую сумму онлайн не провести — переведите её по реквизитам ниже";
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

/** Те же ошибки без одного поля. Исходный объект не меняется. */
export function withoutError(errors: FieldErrors, field: DonationField): FieldErrors {
  if (errors[field] === undefined) {
    return errors;
  }

  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => key !== field),
  ) as FieldErrors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Сколько цифр суммы можно набрать: 10 000 000 ₽ — это восемь. */
const AMOUNT_MAX_DIGITS = 8;

/**
 * Ввод суммы с разрядами: «2500» → «2 500» (неразрывный пробел).
 * Копейки в поле не набираются — пресеты и слоган в целых рублях.
 */
export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, AMOUNT_MAX_DIGITS);

  return digits === "" ? "" : groupDigits(digits);
}

/** Цифр в российском номере после +7. */
const RU_NATIONAL_DIGITS = 10;

/**
 * Маска телефона «+7 (917) 123-45-67».
 *
 * Применяется только к российским (и казахстанским, у них тоже +7) номерам:
 * человек, начавший с «+» и другого кода — например, +996 Кыргызстана, —
 * получает поле без маски. Иначе маска молча переписала бы его номер на +7.
 * Приведение к E.164 при отправке — `normalizePhone`.
 */
export function formatPhoneInput(raw: string): string {
  const trimmed = raw.trimStart();

  if (trimmed.startsWith("+") && !trimmed.startsWith("+7") && trimmed.length > 1) {
    return trimmed;
  }

  const allDigits = trimmed.replace(/\D/g, "");
  const digits =
    allDigits.startsWith("7") || allDigits.startsWith("8") ? allDigits.slice(1) : allDigits;
  const national = digits.slice(0, RU_NATIONAL_DIGITS);

  if (national === "") {
    // «8» или «+7» без номера — начало ввода, показываем код страны.
    // Одинокий «+» — человек стирает код, не мешаем стереть его до конца.
    if (allDigits !== "") {
      return "+7";
    }

    return trimmed === "+" ? "+" : "";
  }

  const parts = [
    `+7 (${national.slice(0, 3)}`,
    national.length > 3 ? `) ${national.slice(3, 6)}` : "",
    national.length > 6 ? `-${national.slice(6, 8)}` : "",
    national.length > 8 ? `-${national.slice(8, 10)}` : "",
  ];

  return parts.join("");
}

/**
 * Удаление в маске: Backspace по «)» или «-» не меняет цифр, и маска
 * вернула бы тот же текст — курсор упёрся бы в скобку навсегда. Если
 * строка стала короче, а цифры те же, убираем последнюю цифру сами.
 */
export function applyPhoneEdit(previous: string, next: string): string {
  const formatted = formatPhoneInput(next);
  const isDeletion = next.length < previous.length;

  if (isDeletion && formatted === previous) {
    return formatPhoneInput(previous.replace(/\d(?=\D*$)/, ""));
  }

  return formatted;
}

/** Сумма для подписи кнопки: только когда она проходит проверку. */
export function selectValidAmount(state: DonationFormState): number | null {
  const amount = selectAmountRubles(state);

  if (amount === null || amount < MIN_DONATION_RUBLES || amount > MAX_DONATION_RUBLES) {
    return null;
  }

  return amount;
}
