import { IsIn, IsISO8601, IsOptional } from 'class-validator';

/** Модель атрибуции: первый заход на сайт или последний заход с метками. */
export const ATTRIBUTION_MODELS = ['first', 'last'] as const;

export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

/**
 * Разрез отчёта. `campaign` и `content` группируются вместе с источником:
 * одна и та же `utm_campaign=ramadan` в Telegram и в Instagram — разные строки.
 * `how_did_you_hear` — ответ из вкладки перевода; модель атрибуции на него не влияет.
 */
export const SOURCE_GROUPINGS = ['source', 'campaign', 'content', 'how_did_you_hear'] as const;

export type SourceGrouping = (typeof SOURCE_GROUPINGS)[number];

export class DonationsBySourceQueryDto {
  /** Начало периода включительно (по дате оплаты), ISO-8601. По умолчанию — 30 дней назад. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Конец периода не включительно. По умолчанию — сейчас. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(ATTRIBUTION_MODELS)
  model?: AttributionModel;

  @IsOptional()
  @IsIn(SOURCE_GROUPINGS)
  groupBy?: SourceGrouping;
}
