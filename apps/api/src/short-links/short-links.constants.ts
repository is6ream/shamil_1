/**
 * Короткие ссылки `/go/<slug>` для QR и соцсетей.
 * Шаблоны — зеркало CHECK-ограничений `short_link_*` в миграции
 * `20261019100000_attribution_last_touch_short_links`.
 */

/** Слаг: строчные латиница и цифры, дефис между ними. Его диктуют голосом. */
export const SHORT_LINK_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SHORT_LINK_SLUG_MAX_LENGTH = 64;

/**
 * Путь своего сайта: один ведущий `/`, сегменты без `//`, `\`, query и фрагмента.
 * `//evil.example` браузер понял бы как чужой домен — открытый редирект.
 */
export const SHORT_LINK_TARGET_PATH_PATTERN = /^\/([A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/;

export const SHORT_LINK_TARGET_PATH_MAX_LENGTH = 256;

export const SHORT_LINK_TITLE_MAX_LENGTH = 200;

/** Публичный префикс коротких ссылок на сайте. */
export const SHORT_LINK_SITE_PREFIX = '/go/';

/**
 * Превью-боты мессенджеров и поисковики. Они открывают ссылку при каждом
 * репосте, и без этого фильтра счётчик кликов считал бы репосты, а не людей.
 *
 * Слов «telegram» и «viber» здесь нет намеренно: встроенный браузер Telegram
 * на Android пишет `Telegram-Android` в user-agent — это живой человек.
 * Бот Telegram ловится по `TelegramBot`, WhatsApp — по префиксу `WhatsApp/`
 * (так представляется его загрузчик превью, а ссылки человек открывает
 * в системном браузере).
 */
export const PREVIEW_BOT_PATTERN =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|facebot|vkshare|skypeuripreview|embedly|^whatsapp\/|curl\/|wget\/|python-requests|go-http-client/i;

/** Сколько ссылок отдаёт список админки. Их единицы, пагинация не нужна. */
export const SHORT_LINK_LIST_LIMIT = 500;
