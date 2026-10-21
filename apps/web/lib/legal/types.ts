/**
 * Модель юридического документа (оферта, политика и т. п.).
 *
 * Текст хранится данными, а не JSX: так его проще сверять с исходным
 * документом заказчика и обновлять без правки разметки.
 */

export interface LegalParagraph {
  readonly kind: "paragraph";
  readonly text: string;
}

/** «Термин — определение»: термин выделяется жирным. */
export interface LegalTerm {
  readonly kind: "term";
  readonly term: string;
  readonly definition: string;
}

/** Список: маркированный или нумерованный («1.», «2.»). */
export interface LegalBullets {
  readonly kind: "bullets";
  readonly items: readonly string[];
  readonly ordered?: boolean;
}

/** Список внешних ссылок (например, справка браузеров про cookie). */
export interface LegalLinks {
  readonly kind: "links";
  readonly items: readonly LegalLinkItem[];
}

export interface LegalLinkItem {
  readonly label: string;
  readonly href: string;
}

/** Ячейка таблицы — те же узлы, что и в тексте: абзацы, списки. */
export type LegalTableCell = readonly LegalNode[];

/** Таблица из документа («Цель обработки — Правовое основание — …»). */
export interface LegalTable {
  readonly kind: "table";
  readonly columns: readonly string[];
  readonly rows: readonly (readonly LegalTableCell[])[];
}

/** Нумерованный пункт («3.1.2.») со своим содержимым и подпунктами. */
export interface LegalClause {
  readonly kind: "clause";
  readonly number: string;
  /** Заголовок пункта, если он есть («Права и обязанности Исполнителя:»). */
  readonly title?: string;
  readonly content: readonly LegalNode[];
}

export type LegalNode =
  | LegalParagraph
  | LegalTerm
  | LegalBullets
  | LegalLinks
  | LegalTable
  | LegalClause;

export interface LegalSection {
  /** Номер раздела. Нет — раздел без номера («Термины», разделы политики cookie). */
  readonly number?: string;
  readonly title: string;
  readonly content: readonly LegalNode[];
}

export interface LegalDocumentData {
  readonly title: string;
  readonly subtitle?: string;
  /** Текст до первого раздела: вводная часть оферты, текст согласия. */
  readonly preamble?: readonly LegalNode[];
  readonly sections: readonly LegalSection[];
}
