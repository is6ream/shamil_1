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
   * Полное юридическое наименование — дословно из публичной оферты
   * заказчика (oferta_0274940398_1.docx). Это же поле «Получатель»
   * в банковском переводе.
   */
  legalName:
    "МЕСТНАЯ МУСУЛЬМАНСКАЯ РЕЛИГИОЗНАЯ ОРГАНИЗАЦИЯ \"МАХАЛЛЯ ШАМИЛЬ\" №2570 Г. УФЫ " +
    "РЕСПУБЛИКИ БАШКОРТОСТАН ЦЕНТРАЛЬНОГО ДУХОВНОГО УПРАВЛЕНИЯ МУСУЛЬМАН РОССИИ" as string | null,
  inn: "0274940398",
  /** ОГРН — из публичной оферты заказчика. */
  ogrn: "1180280054580" as string | null,
  /** Юридический адрес — подтверждён заказчиком. */
  address: "450077, Республика Башкортостан, г. Уфа, ул. Цюрупы, д. 75, офис 5" as string | null,
  /** TODO(заказчик): адрес мечети для блока контактов. */
  mosqueAddress: null as string | null,
  /** Контактный телефон — из публичной оферты заказчика. */
  phone: "+7 (917) 756-77-77" as string | null,
  /** Контактный e-mail — из публичной оферты заказчика. */
  email: "mosqueshamil@gmail.com" as string | null,
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
    "Политика обработки персональных данных",
    "Согласие на обработку ПДн",
    "Условия оплаты",
    "Публичная оферта",
  ] as readonly string[],
} as const;

/**
 * Реквизиты расчётного счёта МРО — от заказчика 21.10.2026, контрольные
 * суммы счетов по БИК сходятся. Это значения по умолчанию: на живом сайте
 * их перекрывает блок «Реквизиты» из админки, если он заполнен.
 */
export const BANK_DETAILS: BankDetails = {
  accountNumber: "40703810606000003898",
  bankName: "Башкирское отделение № 8598 ПАО Сбербанк",
  bik: "048073601",
  correspondentAccount: "30101810300000000601",
  kpp: "027401001",
  sbpQrUrl: null,
};

/**
 * Перевод по QR через СБП — основной способ, пока онлайн-оплата (Robokassa)
 * не подключена (19.10.2026). QR статический: сумму человек вводит сам
 * в приложении банка.
 *
 * Картинка и ссылка — одно и то же: `payUrl` зашит в этот QR. На телефоне
 * свой же экран не отсканировать, поэтому рядом кнопка с той же ссылкой —
 * она открывает выбор банковского приложения. Меняются только вместе.
 */
export const SBP_PAYMENT = {
  qrImageUrl: "/brand/sbp-qr.png",
  payUrl: "https://qr.nspk.ru/AS2A002MH20GUMU39QAQK59LOHKOE13G",
} as const;

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
