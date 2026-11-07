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
import { parseRublesInput, rublesToKopecks } from "@/lib/money";
import { MAX_DONATION_RUBLES, MIN_DONATION_RUBLES, SLOGAN_DONATION_RUBLES } from "@/lib/site";

/**
 * Пресеты сумм — три пилюли справа от поля суммы. 100 ₽ обязателен:
 * он совпадает со слоганом.
 */
export const AMOUNT_PRESETS_RUBLES = [100, 500, 1000] as const;

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

/** Плитка в сетке способов: онлайн-методы плюс перевод по реквизитам. */
export type PaymentOptionId = OnlineMethodId | "transfer";

export const DONATION_FREQUENCIES = {
  monthly: { label: "Каждый месяц", description: "Автоматическое пожертвование один раз в месяц", cadence: "каждый месяц" },
  every_friday: { label: "Каждую пятницу", description: "Автоматическое пожертвование по пятницам", cadence: "каждую пятницу" },
  daily: { label: "Каждый день", description: "Автоматическое пожертвование ежедневно", cadence: "каждый день" },
} as const;

export type DonationFrequency = keyof typeof DONATION_FREQUENCIES;
export type DonationType = "one_time" | "recurring";

export interface DonationCapabilities {
  readonly oneTimeMethods: readonly PaymentOptionId[];
  readonly recurring: {
    readonly methods: readonly OnlineMethodId[];
    readonly frequencies: readonly DonationFrequency[];
    readonly termsUrl?: string;
    readonly dates?: Readonly<Record<DonationFrequency, string>>;
    readonly maxRubles?: number;
    readonly cancellationUrl?: string;
  } | null;
  readonly minRubles: number;
  readonly maxRubles?: number;
}

export const PREVIEW_CAPABILITIES: DonationCapabilities = {
  oneTimeMethods: ["sbp", "card", "sberpay", "tpay", "transfer"],
  recurring: { methods: ["card"], frequencies: ["monthly", "every_friday", "daily"] },
  minRubles: MIN_DONATION_RUBLES,
  maxRubles: MAX_DONATION_RUBLES,
};

export type DonationSubmission = {
  readonly amountKopecks: number;
  readonly isAnonymous: boolean;
  readonly donorName: string;
  readonly donorPhone: string;
  readonly consentAccepted: true;
  readonly region: ResolvedRegion;
  readonly antispam: string;
} & (
  | { donationType: "one_time"; frequency: null; paymentMethod: PaymentOptionId; recurringConsentAccepted: false }
  | { donationType: "recurring"; frequency: DonationFrequency; paymentMethod: OnlineMethodId; recurringConsentAccepted: true }
);

export type DonationSubmit = (data: DonationSubmission) => Promise<{
  /** Текст статуса, подтверждённый адаптером. */
  readonly message?: string;
  /** Готовая к отображению дата от сервера. */
  readonly nextChargeDateLabel?: string;
}>;

export interface DonationFormState {
  readonly donationType: DonationType;
  readonly frequency: DonationFrequency;
  readonly recurringMethod: OnlineMethodId;
  readonly recurringConsentAccepted: boolean;
  /** Онлайн или перевод по реквизитам. Уходит в запрос полем `channel`. */
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
  donationType: "one_time",
  frequency: "monthly",
  recurringMethod: "card",
  recurringConsentAccepted: false,
  channel: "online",
  // 100 ₽ по умолчанию: сумма из слогана. Вариант «1 000 ₽ поднимает средний
  // чек» остаётся открытым вопросом к заказчику (docs/design/handoff.md §10).
  amountInput: String(SLOGAN_DONATION_RUBLES),
  selectedPreset: SLOGAN_DONATION_RUBLES,
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
export type DonationField = "amount" | "donorName" | "phone" | "personalDataConsent" | "recurringConsentAccepted";

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

  if (digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  return `+${digits}`;
}

/** Сумма в рублях либо `null`, если поле пустое или это не число. */
export function selectAmountRubles(state: DonationFormState): number | null {
  return parseRublesInput(state.amountInput);
}

/**
 * Проверка формата. Пустой объект — можно отправлять.
 *
 * Регион не проверяется намеренно: донат без региона обязан проходить,
 * платёж важнее статистики (CLAUDE.md).
 */
export function validate(state: DonationFormState, config = PREVIEW_CAPABILITIES): FieldErrors {
  const errors: FieldErrors = {};
  const amount = selectAmountRubles(state);

  if (amount === null) {
    errors.amount = "Введите сумму пожертвования цифрами";
  } else if (amount <= 0) {
    errors.amount = "Сумма должна быть больше нуля";
  } else if (amount < config.minRubles) {
    errors.amount = `Минимальная сумма — ${groupDigits(String(config.minRubles))} ₽`;
  } else if (config.maxRubles !== undefined && amount > config.maxRubles) {
    errors.amount = `Максимальная сумма — ${groupDigits(String(config.maxRubles))} ₽`;
  } else if (!Number.isSafeInteger(Math.round(amount * 100))) {
    errors.amount = "Введите меньшую сумму";
  }

  if (!state.isAnonymous && state.donorName.trim().length > NAME_MAX_LENGTH) {
    errors.donorName = `Не длиннее ${NAME_MAX_LENGTH} символов`;
  }

  const phone = state.phone.trim();

  const normalizedPhone = normalizePhone(phone);
  if (!state.isAnonymous && phone !== "" && (
    !PHONE_E164_PATTERN.test(normalizedPhone) ||
    (normalizedPhone.startsWith("+7") && !/^\+7\d{10}$/.test(normalizedPhone))
  )) {
    errors.phone = "Проверьте номер: нужен формат +7 917 123-45-67";
  }

  if (!state.personalDataConsent) {
    errors.personalDataConsent = "Подтвердите согласие с условиями пожертвования";
  }

  const recurringMax = config.recurring?.maxRubles;
  if (state.donationType === "recurring" && recurringMax !== undefined &&
    (selectAmountRubles(state) ?? 0) > recurringMax) {
    errors.amount = `Максимальная сумма автоплатежа — ${recurringMax.toLocaleString("ru-RU")} ₽`;
  }

  if (state.donationType === "recurring" && !state.recurringConsentAccepted) {
    errors.recurringConsentAccepted = "Подтвердите согласие на автоплатёж";
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

/**
 * Ввод суммы с разрядами: «2500» → «2 500» (неразрывный пробел).
 * Дробный и незавершённый ввод остаётся видимым для проверки.
 */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[\s₽]/g, "");

  return /^\d+$/.test(cleaned) ? groupDigits(cleaned) : raw;
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
  if (digits.length > RU_NATIONAL_DIGITS) {
    return trimmed;
  }
  const national = digits;

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
export function selectValidAmount(state: DonationFormState, config: DonationCapabilities): number | null {
  return validate(state, config).amount === undefined ? selectAmountRubles(state) : null;
}

/**
 * Какая плитка способа оплаты выбрана. «Расчётный счёт» — это не метод
 * внутри Robokassa, а другой канал (`channel: "transfer"`), поэтому
 * плитка собирается из двух полей состояния.
 */
export function selectPaymentOption(state: DonationFormState): PaymentOptionId {
  return state.channel === "transfer" ? "transfer" : state.onlineMethod;
}

/** Изменения состояния при выборе плитки. Последний онлайн-метод сохраняется. */
export function paymentOptionChanges(option: PaymentOptionId): Partial<DonationFormState> {
  return option === "transfer"
    ? { channel: "transfer" }
    : { channel: "online", onlineMethod: option };
}

export function selectRecurringOptions(state: DonationFormState, config: DonationCapabilities) {
  const methods = config.recurring?.methods ?? [];
  const frequencies = config.recurring?.frequencies ?? [];

  return {
    method: methods.includes(state.recurringMethod) ? state.recurringMethod : methods[0] ?? null,
    frequency: frequencies.includes(state.frequency) ? state.frequency : frequencies[0] ?? null,
  };
}

export function buildDonationSubmission(
  state: DonationFormState,
  config: DonationCapabilities,
  region: ResolvedRegion,
): DonationSubmission | null {
  const amount = selectAmountRubles(state);
  if (amount === null || hasErrors(validate(state, config))) return null;

  const common = {
    amountKopecks: rublesToKopecks(amount),
    isAnonymous: state.isAnonymous,
    donorName: state.isAnonymous ? "" : state.donorName.trim(),
    donorPhone: state.isAnonymous ? "" : normalizePhone(state.phone),
    consentAccepted: true as const,
    region,
    antispam: state.antispam,
  };

  if (state.donationType === "recurring") {
    const { method, frequency } = selectRecurringOptions(state, config);
    if (method === null || frequency === null || !config.recurring?.termsUrl || !config.recurring.cancellationUrl) {
      return null;
    }
    return { ...common, donationType: "recurring", frequency, paymentMethod: method, recurringConsentAccepted: true };
  }

  const method = selectPaymentOption(state);
  const paymentMethod = config.oneTimeMethods.includes(method) ? method : config.oneTimeMethods[0];
  if (paymentMethod === undefined) return null;
  return { ...common, donationType: "one_time", frequency: null, paymentMethod, recurringConsentAccepted: false };
}

/** Changes to the charged terms require a fresh explicit consent. */
export function patchDonationState(current: DonationFormState, changes: Partial<DonationFormState>): DonationFormState {
  const termsChanged = changes.donationType !== undefined || changes.frequency !== undefined
    || changes.amountInput !== undefined || changes.recurringMethod !== undefined;
  return { ...current, ...changes, recurringConsentAccepted: termsChanged ? false
    : changes.recurringConsentAccepted ?? current.recurringConsentAccepted };
}
