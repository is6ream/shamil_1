import type { RegionType } from '../../generated/prisma/enums';

/**
 * Ответы витринных эндпоинтов. Зеркало `apps/web/lib/api/types.ts` —
 * фронтенд написан под эти формы раньше бэкенда (docs/api-gaps.md).
 *
 * Суммы — строки копеек: в базе они `BigInt`, и конвертация явная,
 * в мапперах рядом (`showcase.mappers.ts`), как в `donation-response.dto.ts`.
 *
 * ПДн здесь нет и быть не может: эндпоинты публичные, телефон и имя для
 * сверки лежат в `donation_contact`, а выборки витрины эту таблицу не трогают.
 */

export interface MonthlyGoalResponse {
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
  /** Начало первого дня периода по Москве, ISO-8601. */
  readonly periodStart: string;
  /** Последняя миллисекунда последнего дня периода по Москве, ISO-8601. */
  readonly periodEnd: string;
}

export interface CampaignResponse {
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
  readonly donationsCount: number;
  readonly lastPaidAt: string | null;
  /**
   * `null` — активной цели месяца нет (заказчик ещё не назвал сумму или
   * сейчас промежуток между периодами). Не нули: «0 из 0» читается как поломка.
   */
  readonly monthlyGoal: MonthlyGoalResponse | null;
}

export interface RegionResponse {
  readonly slug: string;
  /** Код субъекта («02») или, у страны, код страны («KZ»). */
  readonly code: string;
  readonly name: string;
  readonly type: RegionType;
  readonly flagUrl: string | null;
}

export interface RegionRankRowResponse {
  readonly slug: string;
  readonly name: string;
  readonly flagUrl: string | null;
  /**
   * Число **платежей** из региона, а не людей: личного кабинета нет,
   * единственный ключ человека — телефон в таблице ПДн, и считать по нему
   * в публичной выборке нельзя. Решение по умолчанию, ждёт подтверждения.
   */
  readonly donorsCount: number;
  readonly paidTotalKopecks: string;
}

export interface TopRegionsResponse {
  readonly items: readonly RegionRankRowResponse[];
  /** Ранжируемые активные регионы без единого поступления. */
  readonly emptyCount: number;
}

export interface DonorRankRowResponse {
  readonly donorName: string;
  readonly paidAmountKopecks: string;
}

export interface FeedItemResponse {
  /** Публичный uuid доната — стабильный React-key; номер счёта наружу не выходит. */
  readonly id: string;
  readonly paidAt: string;
  /** Оплаченная сумма — из колбэка, а не сумма заказа. */
  readonly amountKopecks: string;
  readonly method: string | null;
  readonly regionName: string | null;
  /** `null` у анонимного доната. */
  readonly donorName: string | null;
}

export interface FeedPageResponse {
  readonly items: readonly FeedItemResponse[];
  readonly nextCursor: string | null;
}

export interface GalleryItemResponse {
  readonly id: string;
  readonly url: string;
  readonly caption: string;
  /** «июнь 2026»; пустая строка, если дата съёмки неизвестна. */
  readonly takenAtLabel: string;
}
