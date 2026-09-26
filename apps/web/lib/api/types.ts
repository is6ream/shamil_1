/**
 * Контракты бэкенда глазами фронтенда.
 *
 * Типы написаны руками, а не импортированы из `apps/api`: фронтенд собирается
 * отдельным tsconfig и тянуть в него DTO с декораторами class-validator
 * значит тянуть за ними весь Nest. Цена — ручная синхронизация; чтобы она
 * была дешёвой, у каждого блока указан файл-первоисточник.
 *
 * Суммы всюду строки — в базе они `BigInt` (см. `donation-response.dto.ts`).
 */

/* ── POST /donations ─────────────────────────────────────────────────────
   Первоисточник: apps/api/src/donations/dto/create-donation.dto.ts

   ValidationPipe стоит с `whitelist + forbidNonWhitelisted`: любое поле
   сверх этого списка — 400. Поэтому тип закрытый и тело собирается
   единственной функцией (lib/api/donation-body.ts).                      */

/** Как регион попал в донат. Зеркало `PUBLIC_REGION_SOURCES` бэкенда. */
export type RegionSource = "link" | "form";

export interface CreateDonationBody {
  /** Целое число копеек, 10 000…1 000 000 000 (100 ₽ … 10 000 000 ₽). */
  readonly amountKopecks: number;
  readonly regionSlug?: string;
  readonly regionSource?: RegionSource;
  /** По умолчанию `true`: садака — скрытое поклонение (блок 9 ТЗ). */
  readonly isAnonymous?: boolean;
  /** Публичная подпись в ленте и топе. У анонимного доната игнорируется. */
  readonly donorName?: string;
  /** E.164: `^\+[1-9][0-9]{7,14}$`. В публичные выборки не попадает. */
  readonly phone?: string;
  /** Имя для сверки поступления по реквизитам. Это не публичная подпись. */
  readonly fullName?: string;
  /** Обязан быть `true`, если передан `phone` или `fullName` (152-ФЗ). */
  readonly personalDataConsent?: boolean;
  /** Honeypot: скрытое поле, уходит пустым. */
  readonly antispam?: string;
}

/** Ответ на создание заказа. Статус доната он не подтверждает — только вебхук. */
export interface CreatedDonationResponse {
  readonly orderId: string;
  /** Внешняя Robokassa либо наш `/donate/transfer?order_id=…`. */
  readonly redirectUrl: string;
}

/* ── GET /donations/:id/status ──────────────────────────────────────────── */

/** Зеркало `apps/api/src/donations/donation-status.ts`. `paid` финален. */
export type DonationStatus = "pending" | "paid" | "failed";

export interface DonationStatusResponse {
  readonly orderId: string;
  readonly status: DonationStatus;
  readonly amountKopecks: string;
  /** Фактически оплаченная сумма из вебхука; до оплаты — `null`. */
  readonly paidAmountKopecks: string | null;
  /** ISO-8601 либо `null`, пока вебхук не пришёл. */
  readonly paidAt: string | null;
}

/* ── Витринные данные ────────────────────────────────────────────────────
   Эндпоинтов под них ещё НЕТ — контракты согласованы с бэкендом и описаны
   в docs/api-gaps.md. Реализация сейчас на моках (lib/api/showcase.ts).   */

/** Цель месяца. Без неё общая шкала на старте показывает доли процента. */
export interface MonthlyGoal {
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
  /** ISO-8601, границы периода из `campaign_monthly_goal`. */
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface Campaign {
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
  readonly donationsCount: number;
  readonly lastPaidAt: string | null;
  /** `null`, пока заказчик не назвал сумму и период (открытый вопрос). */
  readonly monthlyGoal: MonthlyGoal | null;
  /**
   * Сколько человек жертвуют ежемесячно — строка статистики макета v2.
   * `null`, пока автоплатежа нет (вне MVP): ячейку тогда не показываем,
   * «0 человек помогают каждый месяц» читается как провал.
   *
   * TODO(api): добавить в `GET /campaign` вместе с автоплатежом.
   */
  readonly monthlyDonorsCount: number | null;
}

/** Двухуровневый справочник: страна → субъект (CLAUDE.md, «Справочник»). */
export type RegionType = "country" | "subject";

export interface Region {
  readonly slug: string;
  /** Код субъекта РФ («02» — Башкортостан) либо код страны (KZ, KG). */
  readonly code: string;
  readonly name: string;
  readonly type: RegionType;
  readonly flagUrl: string | null;
}

export interface RegionRankRow {
  readonly slug: string;
  readonly name: string;
  readonly flagUrl: string | null;
  readonly donorsCount: number;
  readonly paidTotalKopecks: string;
}

export interface DonorRankRow {
  /** Только снявшие анонимность сознательно. */
  readonly donorName: string;
  readonly paidAmountKopecks: string;
}

export interface FeedItem {
  readonly id: string;
  readonly paidAt: string;
  readonly amountKopecks: string;
  /** Способ оплаты: `sbp`, `card`, `bank_transfer`… `null` — неизвестен. */
  readonly method: string | null;
  readonly regionName: string | null;
  /** `null` у анонимного доната — это большинство ленты. */
  readonly donorName: string | null;
}

/** Keyset-страница ленты: курсор по `(paid_at, id)`, без OFFSET. */
export interface FeedPage {
  readonly items: readonly FeedItem[];
  readonly nextCursor: string | null;
}

/* ── Ход строительства ───────────────────────────────────────────────────
   Текстовый чек-лист рядом с галереей — добавка сверх ТЗ. Эндпоинта нет;
   в MVP это статический контент от заказчика, не таблица в БД.           */

export interface BuildStage {
  readonly title: string;
  readonly items: readonly string[];
}

export interface BuildProgress {
  /** ISO-8601: дата последнего обновления. Часть доказательства. */
  readonly updatedAt: string;
  readonly done: BuildStage;
  readonly current: BuildStage;
  readonly upcoming: BuildStage;
}

/* ── Ход строительства, макет v2 ─────────────────────────────────────────
   Вертикальный таймлайн из семи этапов вместо трёх колонок BuildProgress.
   Эндпоинта нет; в MVP это контент от заказчика.                         */

export type ConstructionStageStatus = "done" | "current" | "upcoming";

export interface ConstructionStage {
  readonly id: string;
  readonly title: string;
  readonly status: ConstructionStageStatus;
  /** Смета этапа в копейках. `null` — сумма ещё не названа, не показываем. */
  readonly amountKopecks: string | null;
}

export interface ConstructionTimeline {
  /** ISO-8601: дата последнего обновления. */
  readonly updatedAt: string;
  readonly stages: readonly ConstructionStage[];
}

export interface GalleryItem {
  readonly id: string;
  /** `null`, пока фотографий стройки нет — показываем плашку-заглушку. */
  readonly url: string | null;
  readonly caption: string;
  /** Подпись с датой съёмки: «июнь 2026». */
  readonly takenAtLabel: string;
}
