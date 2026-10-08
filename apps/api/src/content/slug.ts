/**
 * Слаг адреса новости `/novosti/<slug>` из заголовка: транслитерация
 * кириллицы, только `a-z0-9` и дефисы. Та же форма, что держит CHECK
 * `news_post_slug_format`.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 120;

const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Башкирские и татарские буквы — в названиях районов и имён.
  ә: 'a', ө: 'o', ү: 'u', ң: 'n', ҡ: 'k', ғ: 'g', ҙ: 'z', ҫ: 's', һ: 'h', җ: 'zh',
};

export function slugify(title: string): string {
  const latin = [...title.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('');
  const slug = latin
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : 'novost';
}
