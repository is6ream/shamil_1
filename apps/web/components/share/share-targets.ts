import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

/**
 * Куда репостят сбор.
 *
 * Порядок не случаен: WhatsApp первым и с отрывом. У референса 462 репоста
 * в WhatsApp против 218 в Telegram — для Башкортостана, Кавказа и Средней
 * Азии это главный канал. Отсюда же приоритет og:image: превью рендерит
 * именно WhatsApp.
 */
export type ShareTargetId = "whatsapp" | "telegram" | "vk";

export interface ShareTarget {
  readonly id: ShareTargetId;
  readonly label: string;
  readonly buildUrl: (shareUrl: string, text: string) => string;
}

/** Текст репоста. Слоган здесь и есть приглашение — объяснять нечего. */
export const SHARE_TEXT = `${SITE_NAME} — ${SLOGAN}`;

export const SHARE_TARGETS: readonly ShareTarget[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    buildUrl: (url, text) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    buildUrl: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "vk",
    label: "ВКонтакте",
    buildUrl: (url) => `https://vk.com/share.php?url=${encodeURIComponent(url)}`,
  },
];

/**
 * Что именно репостим. Региональная ссылка отличается от общей: у неё своё
 * OG-превью с суммой региона, и репост земляку должен вести именно на неё.
 */
export function buildShareUrl(regionSlug?: string): string {
  return regionSlug === undefined || regionSlug === ""
    ? SITE_URL
    : `${SITE_URL}/?region=${encodeURIComponent(regionSlug)}`;
}
