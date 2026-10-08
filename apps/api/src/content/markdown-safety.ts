/**
 * Текст новости — markdown без HTML (D-12). Сайт рендерит его без raw HTML,
 * а сервер не пропускает то, что опасно при любом рендерере:
 *
 *  • HTML-теги, комментарии, `<!DOCTYPE>`, инструкции `<?…?>` и autolink'и
 *    в угловых скобках — всё, что начинается с `<` и буквы, `/`, `!` или `?`;
 *  • ссылки и картинки со схемой, кроме http(s), mailto и tel: `javascript:`,
 *    `data:`, `vbscript:`, `file:` — даже с переносами и сущностями внутри.
 *
 * Возвращает текст ошибки или `null`, если текст безопасен.
 */

const HTML_LIKE = /<\s*[A-Za-z!/?]/;

/** `[текст](адрес "title")` и `![alt](адрес)` — берём адрес до пробела или `)`. */
const INLINE_LINK = /\]\(\s*<?([^\s)>]*)/g;

/** `[ref]: адрес` — сноски-ссылки. */
const REFERENCE_LINK = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm;

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Убираем то, чем прячут схему: управляющие символы, пробелы, HTML-сущности. */
function normalizeDestination(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000- \u007f]/g, '')
      .replace(/&#x?[0-9a-f]+;?|&[a-z]+;?/gi, '')
      .toLowerCase()
  );
}

function isUnsafeDestination(raw: string): boolean {
  const scheme = SCHEME.exec(normalizeDestination(raw))?.[1];

  return scheme !== undefined && !ALLOWED_SCHEMES.has(scheme);
}

export function findMarkdownProblem(markdown: string): string | null {
  if (HTML_LIKE.test(markdown)) {
    return 'HTML в тексте не допускается — только markdown (ссылки пишутся как [текст](https://…))';
  }

  for (const pattern of [INLINE_LINK, REFERENCE_LINK]) {
    for (const match of markdown.matchAll(pattern)) {
      if (isUnsafeDestination(match[1] ?? '')) {
        return 'Ссылки — только http(s), mailto и tel';
      }
    }
  }

  return null;
}
