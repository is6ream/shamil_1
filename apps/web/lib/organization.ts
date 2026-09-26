/**
 * Организация-получатель пожертвований и её реквизиты.
 *
 * ЗДЕСЬ НЕТ НИ ОДНОЙ ВЫДУМАННОЙ ЦИФРЫ. Подтверждено только то, что записано
 * в CLAUDE.md: получатель — МРО «Махалля Шамиль», ИНН 0274940398. Всё
 * остальное — блокер к заказчику (CLAUDE.md → «Открытые вопросы»,
 * docs/design/handoff.md → день 10), и до ответа стоит `null`.
 *
 * `null` осознанно вместо правдоподобной заглушки: номер счёта из воздуха
 * на странице оплаты — это деньги, ушедшие в никуда. Компоненты обязаны
 * показывать вместо него «реквизиты уточняются», а не печатать пустоту.
 */

interface OrganizationDocument {
  readonly title: string;
  /** Путь к PDF в `public/docs`. `null` — файла ещё нет. */
  readonly url: string | null;
}

/** Реквизиты расчётного счёта для перевода вручную. */
export interface BankDetails {
  readonly accountNumber: string | null;
  readonly bankName: string | null;
  readonly bik: string | null;
  readonly correspondentAccount: string | null;
  readonly kpp: string | null;
  /** Картинка QR СБП в `public`. `null` — QR ещё не выпущен. */
  readonly sbpQrUrl: string | null;
}

export const ORGANIZATION = {
  shortName: "Мечеть «Шамиль»",
  /** Краткое наименование получателя — подтверждено (CLAUDE.md, «Платежи»). */
  recipientShortName: "МРО «Махалля Шамиль»",
  /**
   * TODO(заказчик): полное юридическое наименование одной строкой.
   * Нужно дословно: это поле «Получатель» в банковском переводе.
   */
  legalName: null as string | null,
  inn: "0274940398",
  /** TODO(заказчик): ОГРН. */
  ogrn: null as string | null,
  /** TODO(заказчик): юридический адрес. */
  address: null as string | null,
  /** TODO(заказчик): адрес мечети для блока контактов. */
  mosqueAddress: null as string | null,
  /** TODO(заказчик): телефон для блока контактов, в виде «+7 (347) 000-00-00». */
  phone: null as string | null,
  /** Имам мечети — назван в CLAUDE.md. */
  imamName: "Вадим Агаев",
  /** TODO(заказчик): Telegram-канал, имя без @ — «mechetshamil». */
  telegramChannel: null as string | null,

  /**
   * Пять документов в порядке макета v2. Файлы кладутся в `public/docs/`
   * и подставляются сюда; `url: null` — строка неактивна, «скоро».
   *
   * TODO(заказчик): PDF всех пяти документов.
   */
  documents: [
    { title: "Свидетельство о регистрации", url: null },
    { title: "Устав организации", url: null },
    { title: "Выписка ЕГРЮЛ", url: null },
    { title: "Разрешение на строительство", url: null },
    { title: "Агентский договор с платёжной платформой", url: null },
  ] as readonly OrganizationDocument[],

  /** Обязательны по 152-ФЗ, готовятся вместе с юридической частью. */
  legalPages: [
    "Политика конфиденциальности",
    "Согласие на обработку ПДн",
    "Условия оплаты",
  ] as readonly string[],
} as const;

/**
 * TODO(заказчик): реквизиты расчётного счёта — блокер к дню 10.
 * Нужны и как запасной путь оплаты, и как признак легальности сбора.
 */
export const BANK_DETAILS: BankDetails = {
  accountNumber: null,
  bankName: null,
  bik: null,
  correspondentAccount: null,
  kpp: null,
  sbpQrUrl: null,
};

/** Назначение платежа для перевода по реквизитам. */
export const PAYMENT_PURPOSE = "Пожертвование на строительство мечети";

/** Полное наименование, а до его подтверждения — краткое. Для футера. */
export function organizationDisplayName(): string {
  return ORGANIZATION.legalName ?? ORGANIZATION.recipientShortName;
}

/** «+7 (347) 000-00-00» → «tel:+73470000000». */
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Есть ли что показывать в блоке реквизитов. */
export function hasBankDetails(details: BankDetails = BANK_DETAILS): boolean {
  return details.accountNumber !== null && details.bik !== null;
}
