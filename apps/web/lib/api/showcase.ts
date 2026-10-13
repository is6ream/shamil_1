/**
 * Витринные данные: цель и собрано, рейтинги, лента, справочник регионов,
 * галерея — из бэкенда (контракты в docs/api-gaps.md).
 *
 * Правила, которые обязана сохранить реализация:
 *   • суммы остаются строками копеек — в базе это `BigInt`;
 *   • лента листается keyset-курсором по `(paid_at, id)`, не OFFSET;
 *   • функции честно бросают `ApiError`: решение «что показать, если бэкенд
 *     недоступен» принимает страница (`withFallback`), а не этот слой —
 *     иначе «Показать ещё» в браузере не узнало бы об ошибке.
 *
 * Тексты, этапы стройки, видео и новости из админки — в `site-content.ts`.
 */

import { apiGet } from "./client";
import { FIXTURE_BUILD_PROGRESS, FIXTURE_GALLERY } from "./showcase.fixtures";
import type {
  BuildProgress,
  Campaign,
  DonorRankRow,
  FeedPage,
  GalleryItem,
  Region,
  RegionRankRow,
  TopRegionsResponse,
} from "./types";

/** Сколько поступлений отдаётся одной страницей ленты: шесть строк — макет v2. */
export const FEED_PAGE_SIZE = 6;

/** Сколько строк рейтинга регионов показываем до «ещё N регионов». */
export const TOP_REGIONS_LIMIT = 10;

/** Строк в блоке «География поддержки» на главной (макет v2). */
export const HOME_REGIONS_LIMIT = 6;

/**
 * Живые цифры: сумма, рейтинги, лента. 15 секунд — донатер, вернувшийся
 * со «спасибо», видит свой платёж почти сразу, а бэкенд не отвечает
 * на каждое открытие главной.
 */
const LIVE_REVALIDATE_S = 15;

/** Справочник регионов и галерея меняются редко — час. */
const STATIC_REVALIDATE_S = 3600;

/**
 * Плашки галереи на случай, когда снимков нет или бэкенд недоступен:
 * пустая сетка читается как сломанная страница.
 */
export const GALLERY_PLACEHOLDERS: readonly GalleryItem[] = FIXTURE_GALLERY;

/** Цифры сбора: общая цель, цель месяца, число платежей. */
export function getCampaign(): Promise<Campaign> {
  return apiGet<Campaign>("/campaign", { revalidate: LIVE_REVALIDATE_S, tags: ["campaign"] });
}

/**
 * Справочник для селектора «Откуда вы?».
 *
 * Два канала атрибуции — ссылка и селектор — вместо одного у референса,
 * где 93% денег не попали ни в одну строку рейтинга (CLAUDE.md).
 */
export function getRegions(): Promise<readonly Region[]> {
  return apiGet<readonly Region[]>("/regions", { revalidate: STATIC_REVALIDATE_S });
}

/**
 * Один ответ на обе функции ниже. Второй вызов в том же серверном рендере
 * сети не трогает: одинаковый GET с теми же опциями Next.js мемоизирует
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`,
 * «Memoization»).
 */
function getTopRegionsResponse(): Promise<TopRegionsResponse> {
  return apiGet<TopRegionsResponse>("/regions/top", { revalidate: LIVE_REVALIDATE_S });
}

/** Топ поддерживающих регионов и стран в одном списке. */
export async function getTopRegions(): Promise<readonly RegionRankRow[]> {
  return (await getTopRegionsResponse()).items;
}

/**
 * Сколько регионов справочника ещё без пожертвований. Показываем числом,
 * а не стеной пустых строк: пустая строка — вызов, 64 нуля подряд
 * читаются как «блок сломан».
 */
export async function getEmptyRegionsCount(): Promise<number> {
  return (await getTopRegionsResponse()).emptyCount;
}

/** Топ донатеров — только снявшие анонимность сознательно. */
export function getTopDonors(): Promise<readonly DonorRankRow[]> {
  return apiGet<readonly DonorRankRow[]>("/donors/top", { revalidate: LIVE_REVALIDATE_S });
}

/**
 * Страница живой ленты. Курсор непрозрачный: фронтенд его не разбирает,
 * а возвращает бэкенду как есть — иначе смена схемы пагинации потребует
 * правки клиента.
 *
 * Кешируется только первая страница: продолжение запрашивает браузер
 * («Показать ещё»), и там `next.revalidate` не действует.
 */
export function getFeed(cursor?: string): Promise<FeedPage> {
  const query = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });

  if (cursor !== undefined) {
    query.set("cursor", cursor);
  }

  return apiGet<FeedPage>(`/donations/feed?${query.toString()}`, { revalidate: LIVE_REVALIDATE_S });
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
 * Фотографии стройки, хронологически с самых первых этапов (ТЗ, блок 6).
 * Пока в базе нет ни одного снимка, показываем плашки с датами: пустая
 * сетка читается как сломанная страница.
 */
export async function getGallery(): Promise<readonly GalleryItem[]> {
  const items = await apiGet<readonly GalleryItem[]>("/gallery", {
    revalidate: STATIC_REVALIDATE_S,
    tags: ["gallery"],
  });

  // Подпись в админке необязательна, а вёрстка ждёт строку.
  return items.length > 0 ? items.map((item) => ({ ...item, caption: item.caption ?? "" })) : GALLERY_PLACEHOLDERS;
}
