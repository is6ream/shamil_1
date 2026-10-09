/**
 * Проверка текста новости до отправки — зеркало `apps/api/src/content/markdown-safety.ts`
 * (те же правила и те же тексты ошибок, API.md §12). Сервер всё равно
 * проверит сам; здесь — чтобы не терять 100 000 символов на 400.
 */

const HTML_LIKE = /<\s*[A-Za-z!/?]/;
const INLINE_LINK = /\]\(\s*<?([^\s)>]*)/g;
const REFERENCE_LINK = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/gm;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

export const HTML_MESSAGE = "HTML в тексте не допускается — только markdown (ссылки пишутся как [текст](https://…))";
export const SCHEME_MESSAGE = "Ссылки — только http(s), mailto и tel";

function normalizeDestination(raw: string): string {
  return (
    raw
      .replace(/[\u0000- \u007f]/g, "")
      .replace(/&#x?[0-9a-f]+;?|&[a-z]+;?/gi, "")
      .toLowerCase()
  );
}

function isUnsafeDestination(raw: string): boolean {
  const scheme = SCHEME.exec(normalizeDestination(raw))?.[1];

  return scheme !== undefined && !ALLOWED_SCHEMES.has(scheme);
}

/** Текст ошибки или `null`, если текст безопасен. */
export function findMarkdownProblem(markdown: string): string | null {
  if (HTML_LIKE.test(markdown)) {
    return HTML_MESSAGE;
  }

  for (const pattern of [INLINE_LINK, REFERENCE_LINK]) {
    for (const match of markdown.matchAll(pattern)) {
      if (isUnsafeDestination(match[1] ?? "")) {
        return SCHEME_MESSAGE;
      }
    }
  }

  return null;
}
