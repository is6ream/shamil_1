/**
 * Короткие конструкторы узлов юридического документа — чтобы тексты
 * в `offer.ts`, `privacy.ts` и др. читались как сам документ, а не как JSON.
 */

import type {
  LegalBullets,
  LegalClause,
  LegalLinkItem,
  LegalLinks,
  LegalNode,
  LegalParagraph,
  LegalSection,
  LegalTable,
  LegalTableCell,
  LegalTerm,
} from "./types";

export const p = (text: string): LegalParagraph => ({ kind: "paragraph", text });

export const term = (name: string, definition: string): LegalTerm => ({
  kind: "term",
  term: name,
  definition,
});

export const bullets = (...items: string[]): LegalBullets => ({ kind: "bullets", items });

export const ordered = (...items: string[]): LegalBullets => ({
  kind: "bullets",
  items,
  ordered: true,
});

export const links = (...items: LegalLinkItem[]): LegalLinks => ({ kind: "links", items });

export const table = (
  columns: readonly string[],
  ...rows: (readonly LegalTableCell[])[]
): LegalTable => ({ kind: "table", columns, rows });

/** Ячейка таблицы из одной строки текста. */
export const cell = (text: string): LegalTableCell => [p(text)];

export const clause = (number: string, ...content: LegalNode[]): LegalClause => ({
  kind: "clause",
  number,
  content,
});

export const titledClause = (
  number: string,
  title: string,
  ...content: LegalNode[]
): LegalClause => ({
  kind: "clause",
  number,
  title,
  content,
});

export const section = (number: string, title: string, ...content: LegalNode[]): LegalSection => ({
  number,
  title,
  content,
});

/** Раздел без номера — заголовок как в документе, без «N.». */
export const unnumberedSection = (title: string, ...content: LegalNode[]): LegalSection => ({
  title,
  content,
});
