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
  /** TODO(заказчик): полное юридическое наименование одной строкой. */
  legalName: "МРО «Махалля Шамиль» — полное наименование уточняется",
  inn: "0274940398",
  /** TODO(заказчик): ОГРН. */
  ogrn: null as string | null,
  /** TODO(заказчик): юридический адрес. */
  address: null as string | null,
  /** TODO(заказчик): адрес мечети для блока контактов. */
  mosqueAddress: null as string | null,
  /** TODO(заказчик): телефон для блока контактов. */
  phone: null as string | null,

  /**
   * Пять документов — тот же набор, что у референса. Файлы кладутся
   * в `public/docs/` и подставляются сюда.
   */
  documents: [
    { title: "Устав", url: null },
    { title: "Свидетельство о регистрации", url: null },
    { title: "Свидетельство ФНС", url: null },
    { title: "Регистрация юрлица", url: null },
    { title: "Агентский договор", url: null },
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

/** Есть ли что показывать в блоке реквизитов. */
export function hasBankDetails(details: BankDetails = BANK_DETAILS): boolean {
  return details.accountNumber !== null && details.bik !== null;
}
