/**
 * Разбивает текст юридического документа на куски «текст / ссылка»:
 * адреса сайтов и e-mail в документах заказчика написаны прямо в тексте,
 * и по ним должно быть можно перейти.
 */

export type TextChunk =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "link"; readonly value: string; readonly href: string };

/** URL или e-mail. Завершающая пунктуация («.», «,», «;», «)») в ссылку не входит. */
const LINK_PATTERN = /https?:\/\/[^\s]+?(?=[.,;:)»"”]*(?:\s|$))|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export function linkify(text: string): readonly TextChunk[] {
  const chunks: TextChunk[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const value = match[0];
    const start = match.index;

    if (start > cursor) {
      chunks.push({ kind: "text", value: text.slice(cursor, start) });
    }

    const href = value.startsWith("http") ? value : `mailto:${value}`;
    chunks.push({ kind: "link", value, href });
    cursor = start + value.length;
  }

  if (cursor < text.length) {
    chunks.push({ kind: "text", value: text.slice(cursor) });
  }

  return chunks;
}
