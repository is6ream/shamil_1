import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import type { DonationUtmDto } from '../donations/dto/donation-utm.dto';
import { ATTRIBUTION_WINDOW_DAYS, FIRST_TOUCH_CLOCK_SKEW_MS } from './attribution.constants';
import type { AttributionDto, UtmTouchDto } from './dto/attribution.dto';
import { classifyReferrer } from './referrer-classifier';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сутки сверх окна: cookie живёт 90 дней по часам браузера, а не сервера. */
const FIRST_TOUCH_MAX_AGE_MS = (ATTRIBUTION_WINDOW_DAYS + 1) * DAY_MS;

/** Колонки атрибуции доната. «Метки не было» — это `null`, а не пустая строка. */
export interface AttributionColumns {
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly utmContent: string | null;
  readonly utmTerm: string | null;
  readonly referrer: string | null;
  readonly landingPage: string | null;
  readonly firstTouchAt: Date | null;
  readonly lastUtmSource: string | null;
  readonly lastUtmMedium: string | null;
  readonly lastUtmCampaign: string | null;
  readonly lastUtmContent: string | null;
  readonly lastUtmTerm: string | null;
}

/** Что пришло в теле доната: новая форма, старая или ничего. */
export interface AttributionInput {
  readonly attribution?: AttributionDto;
  /** @deprecated поле `utm` старого клиента — только first-touch. */
  readonly utm?: DonationUtmDto;
}

interface Touch {
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  readonly content: string | null;
  readonly term: string | null;
}

const EMPTY_TOUCH: Touch = { source: null, medium: null, campaign: null, content: null, term: null };

export const EMPTY_ATTRIBUTION: AttributionColumns = {
  ...toFirstColumns(EMPTY_TOUCH),
  referrer: null,
  landingPage: null,
  firstTouchAt: null,
  ...toLastColumns(EMPTY_TOUCH),
};

/** Повторная нормализация в сервисе: сервис вызывают не только через ValidationPipe. */
function normalized(value: string | undefined): string | null {
  const result = value?.trim().toLowerCase();

  return result === undefined || result.length === 0 ? null : result;
}

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();

  return result === undefined || result.length === 0 ? null : result;
}

function toTouch(dto: UtmTouchDto | undefined): Touch {
  return {
    source: normalized(dto?.source),
    medium: normalized(dto?.medium),
    campaign: normalized(dto?.campaign),
    content: normalized(dto?.content),
    term: normalized(dto?.term),
  };
}

function toFirstColumns(touch: Touch): Pick<
  AttributionColumns,
  'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'utmTerm'
> {
  return {
    utmSource: touch.source,
    utmMedium: touch.medium,
    utmCampaign: touch.campaign,
    utmContent: touch.content,
    utmTerm: touch.term,
  };
}

function toLastColumns(touch: Touch): Pick<
  AttributionColumns,
  'lastUtmSource' | 'lastUtmMedium' | 'lastUtmCampaign' | 'lastUtmContent' | 'lastUtmTerm'
> {
  return {
    lastUtmSource: touch.source,
    lastUtmMedium: touch.medium,
    lastUtmCampaign: touch.campaign,
    lastUtmContent: touch.content,
    lastUtmTerm: touch.term,
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Адрес сайта проверен валидацией окружения; сюда попасть нельзя,
    // но без своего хоста классификация просто не исключит переходы по сайту.
    return null;
  }
}

/**
 * Атрибуция доната: нормализация меток, источник по Referer, last-touch.
 *
 * Правила:
 * - Атрибуции нет вовсе (нет cookie) — все колонки `null`: в отчёте это
 *   строка «без атрибуции». Человек с выключенными cookie — не «прямой заход».
 * - Нет `utm_source` у первого касания — источник и канал берутся по Referer
 *   (`t.me` → telegram/referral, Яндекс → yandex/organic, пусто → direct/none).
 *   Явные метки приоритетнее: Referer заполняет только то, чего нет.
 * - Нет last-touch с источником — last-touch равен first-touch. Тогда отчёт
 *   по модели last не теряет донаты, пришедшие одним касанием.
 * - Время первого захода из будущего или старше окна атрибуции — `null`:
 *   cookie могли подменить руками, а в отчёте такие даты врут.
 */
@Injectable()
export class AttributionService {
  private readonly ownHosts: readonly string[];

  constructor(config: ConfigService<AppConfig, true>) {
    const siteHost = hostOf(config.get('publicUrls', { infer: true }).siteUrl);

    this.ownHosts = siteHost === null ? [] : [siteHost.replace(/^www\./, '')];
  }

  resolve(input: AttributionInput, now: Date = new Date()): AttributionColumns {
    if (input.attribution !== undefined && input.utm !== undefined) {
      throw new BadRequestException('Атрибуция передаётся одним полем: attribution (utm устарело)');
    }

    const attribution = input.attribution ?? this.fromLegacy(input.utm);

    if (attribution === undefined) {
      return EMPTY_ATTRIBUTION;
    }

    const referrer = trimmed(attribution.referrer);
    const first = this.withReferrerFallback(toTouch(attribution.first), referrer);
    const explicitLast = toTouch(attribution.last);
    const last = explicitLast.source === null ? first : explicitLast;

    return {
      ...toFirstColumns(first),
      referrer,
      landingPage: trimmed(attribution.landingPage),
      firstTouchAt: this.parseFirstTouchAt(attribution.firstTouchAt, now),
      ...toLastColumns(last),
    };
  }

  /** Классификация Referer — отдельно, для отчёта и тестов. */
  classify(referrer: string | null): { readonly source: string; readonly medium: string } {
    return classifyReferrer(referrer, this.ownHosts);
  }

  private fromLegacy(utm: DonationUtmDto | undefined): AttributionDto | undefined {
    if (utm === undefined) {
      return undefined;
    }

    const { referrer, landingPage, ...first } = utm;

    return { first, referrer, landingPage };
  }

  private withReferrerFallback(touch: Touch, referrer: string | null): Touch {
    if (touch.source !== null) {
      return touch;
    }

    const classified = this.classify(referrer);

    return { ...touch, source: classified.source, medium: touch.medium ?? classified.medium };
  }

  private parseFirstTouchAt(value: string | undefined, now: Date): Date | null {
    if (value === undefined) {
      return null;
    }

    const time = new Date(value).getTime();

    if (Number.isNaN(time)) {
      return null;
    }

    const isFromFuture = time > now.getTime() + FIRST_TOUCH_CLOCK_SKEW_MS;
    const isTooOld = now.getTime() - time > FIRST_TOUCH_MAX_AGE_MS;

    return isFromFuture || isTooOld ? null : new Date(time);
  }
}
