/**
 * Единственное место, где данные формы превращаются в тело `POST /donations`.
 *
 * Зачем отдельный модуль: на бэкенде `ValidationPipe` стоит с
 * `forbidNonWhitelisted`, то есть **любой** лишний ключ в объекте — 400.
 * Если тело собирать по месту в компоненте, первый же `channel` или `email`,
 * добавленный «на будущее», сломает приём денег. Здесь список полей закрыт
 * и виден целиком.
 *
 * Функция чистая — её поведение проверяется без рендера.
 */

import { rublesToKopecks } from "@/lib/money";

import type { CreateDonationBody, RegionSource } from "./types";

/** Что знает форма. Шире DTO: `channel` в запрос пока не уходит (см. ниже). */
export interface DonationDraft {
  /** Сумма в рублях, как её набрал человек. В копейки переводим здесь. */
  readonly amountRubles: number;
  readonly isAnonymous: boolean;
  /** Публичная подпись. Имеет смысл только при снятой анонимности. */
  readonly donorName: string;
  /** Имя для сверки поступления по реквизитам. */
  readonly fullName: string;
  /** Телефон в E.164 либо пустая строка. */
  readonly phone: string;
  readonly personalDataConsent: boolean;
  readonly regionSlug: string;
  readonly regionSource: RegionSource;
  /** Honeypot: у человека всегда пустой. */
  readonly antispam: string;
  /**
   * Онлайн или перевод по реквизитам.
   *
   * TODO(api): поля `channel` в `CreateDonationDto` пока нет — провайдер
   * выбирается глобально через `PAYMENT_PROVIDER`. Отправка этого значения
   * сейчас даёт 400; контракт расширения описан в docs/api-gaps.md.
   */
  readonly channel: DonationChannel;
}

export type DonationChannel = "online" | "transfer";

/** Тело собирается по шагам, поэтому внутри функции оно изменяемое. */
type MutableDonationBody = {
  -readonly [K in keyof CreateDonationBody]: CreateDonationBody[K];
};

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

/**
 * Собирает тело запроса. Пустые поля не превращаются в пустые строки:
 * `""` — это присланное значение, и для `fullName` оно создало бы строку
 * персональных данных на пустом месте.
 */
export function buildCreateDonationBody(draft: DonationDraft): CreateDonationBody {
  const body: MutableDonationBody = {
    amountKopecks: rublesToKopecks(draft.amountRubles),
    isAnonymous: draft.isAnonymous,
  };

  // Анонимный донат не несёт публичной подписи вообще: на бэкенде это CHECK
  // `donation_anonymous_has_no_public_name`. Чего не отправили — то невозможно
  // показать по ошибке.
  const donorName = draft.isAnonymous ? undefined : trimmedOrUndefined(draft.donorName);

  if (donorName !== undefined) {
    body.donorName = donorName;
  }

  const fullName = trimmedOrUndefined(draft.fullName);

  if (fullName !== undefined) {
    body.fullName = fullName;
  }

  const phone = trimmedOrUndefined(draft.phone);

  if (phone !== undefined) {
    body.phone = phone;
  }

  // Согласие отправляем только вместе с ПДн: без них бэкенд строку контакта
  // не создаёт, а лишний `personalDataConsent: false` — просто шум в запросе.
  if (fullName !== undefined || phone !== undefined) {
    body.personalDataConsent = draft.personalDataConsent;
  }

  const regionSlug = trimmedOrUndefined(draft.regionSlug);

  if (regionSlug !== undefined) {
    body.regionSlug = regionSlug;
    body.regionSource = draft.regionSource;
  }

  // Honeypot отправляем как есть, а не пустым принудительно: в этом и смысл
  // приёма. Человек поле не видит и не заполняет, бот заполняет охотно —
  // и тогда `@IsEmpty()` на бэкенде отклоняет запрос. Подчистив значение
  // здесь, мы бы аккуратно провели бота через проверку.
  body.antispam = draft.antispam;

  return body;
}
