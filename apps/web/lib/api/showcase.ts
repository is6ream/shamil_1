/**
 * Витринные данные: цель и собрано, рейтинги, лента, справочник регионов.
 *
 * ЭНДПОИНТОВ ПОД ЭТО ЕЩЁ НЕТ. Контракты согласованы и описаны в
 * docs/api-gaps.md; здесь они реализованы моками за тем же интерфейсом,
 * чтобы стыковка сводилась к замене тела функции — без единой правки
 * в компонентах.
 *
 * Правила, которые обязана сохранить боевая реализация:
 *   • суммы остаются строками копеек — в базе это `BigInt`;
 *   • лента листается keyset-курсором по `(paid_at, id)`, не OFFSET;
 *   • функции остаются асинхронными.
 */

import {
  FIXTURE_BUILD_PROGRESS,
  FIXTURE_CAMPAIGN,
  FIXTURE_CONSTRUCTION,
  FIXTURE_EMPTY_REGIONS_COUNT,
  FIXTURE_FEED,
  FIXTURE_GALLERY,
  FIXTURE_REGIONS,
  FIXTURE_TOP_DONORS,
  FIXTURE_TOP_REGIONS,
} from "./showcase.fixtures";
import type {
  BuildProgress,
  Campaign,
  ConstructionTimeline,
  DonorRankRow,
  FeedPage,
  GalleryItem,
  Region,
  RegionRankRow,
} from "./types";

/** Сколько поступлений отдаётся одной страницей ленты: шесть строк — макет v2. */
export const FEED_PAGE_SIZE = 6;

/** Сколько строк рейтинга регионов показываем до «ещё N регионов». */
export const TOP_REGIONS_LIMIT = 10;

/** Строк в блоке «География поддержки» на главной (макет v2). */
export const HOME_REGIONS_LIMIT = 6;

/**
 * Цифры сбора: общая цель, цель месяца, число платежей.
 *
 * TODO(api): GET {API_URL}/campaign
 * return apiGet<Campaign>("/campaign");
 */
export function getCampaign(): Promise<Campaign> {
  return Promise.resolve(FIXTURE_CAMPAIGN);
}

/**
 * Справочник для селектора «Откуда вы?».
 *
 * Два канала атрибуции — ссылка и селектор — вместо одного у референса,
 * где 93% денег не попали ни в одну строку рейтинга (CLAUDE.md).
 *
 * TODO(api): GET {API_URL}/regions
 * return apiGet<readonly Region[]>("/regions");
 */
export function getRegions(): Promise<readonly Region[]> {
  return Promise.resolve(FIXTURE_REGIONS);
}

/**
 * Топ поддерживающих регионов и стран в одном списке.
 *
 * TODO(api): GET {API_URL}/regions/top
 * return apiGet<readonly RegionRankRow[]>("/regions/top");
 */
export function getTopRegions(): Promise<readonly RegionRankRow[]> {
  return Promise.resolve(FIXTURE_TOP_REGIONS);
}

/**
 * Сколько регионов справочника ещё без пожертвований. Показываем числом,
 * а не стеной пустых строк: пустая строка — вызов, 64 нуля подряд
 * читаются как «блок сломан».
 *
 * TODO(api): придёт полем ответа `GET /regions/top` — уточнить с бэкендом,
 * отдельный вызов ради одного числа не нужен.
 */
export function getEmptyRegionsCount(): Promise<number> {
  return Promise.resolve(FIXTURE_EMPTY_REGIONS_COUNT);
}

/**
 * Топ донатеров — только снявшие анонимность сознательно.
 *
 * TODO(api): GET {API_URL}/donors/top
 * return apiGet<readonly DonorRankRow[]>("/donors/top");
 */
export function getTopDonors(): Promise<readonly DonorRankRow[]> {
  return Promise.resolve(FIXTURE_TOP_DONORS);
}

/**
 * Страница живой ленты. Курсор непрозрачный: фронтенд его не разбирает,
 * а возвращает бэкенду как есть — иначе смена схемы пагинации потребует
 * правки клиента.
 *
 * TODO(api): GET {API_URL}/donations/feed?cursor=…
 * return apiGet<FeedPage>(`/donations/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
 */
export function getFeed(cursor?: string): Promise<FeedPage> {
  const offset = cursor === undefined ? 0 : Number(cursor);
  const start = Number.isNaN(offset) ? 0 : offset;
  const items = FIXTURE_FEED.slice(start, start + FEED_PAGE_SIZE);
  const nextOffset = start + items.length;

  return Promise.resolve({
    items,
    nextCursor: nextOffset < FIXTURE_FEED.length ? String(nextOffset) : null,
  });
}

/**
 * Текстовый ход строительства. В MVP это контент от заказчика, а не таблица
 * в базе: отвечает на немой вопрос «деньги точно на стройку?» лучше
 * фотографий и, в отличие от них, индексируется поисковиками.
 */
export function getBuildProgress(): Promise<BuildProgress> {
  return Promise.resolve(FIXTURE_BUILD_PROGRESS);
}

/**
 * Ход строительства для таймлайна макета v2: семь этапов со статусом
 * и сметой. Как и `getBuildProgress`, в MVP это контент от заказчика.
 *
 * TODO(api): если этапы переедут в базу —
 * return apiGet<ConstructionTimeline>("/construction");
 */
export function getConstructionStages(): Promise<ConstructionTimeline> {
  return Promise.resolve(FIXTURE_CONSTRUCTION);
}

/**
 * Фотографии стройки. В базе под них есть `gallery_item`; эндпоинта пока нет,
 * да и самих фотографий тоже — блокер из CLAUDE.md.
 *
 * TODO(api): GET {API_URL}/gallery
 */
export function getGallery(): Promise<readonly GalleryItem[]> {
  return Promise.resolve(FIXTURE_GALLERY);
}
