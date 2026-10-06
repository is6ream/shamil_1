/**
 * Модель юридического документа (оферта, политика и т. п.).
 *
 * Текст хранится данными, а не JSX: так его проще сверять с исходным
 * .docx от юриста и обновлять без правки разметки.
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

export interface LegalBullets {
  readonly kind: "bullets";
  readonly items: readonly string[];
}

/** Нумерованный пункт («3.1.2.») со своим содержимым и подпунктами. */
export interface LegalClause {
  readonly kind: "clause";
  readonly number: string;
  /** Заголовок пункта, если он есть («Права и обязанности Исполнителя:»). */
  readonly title?: string;
  readonly content: readonly LegalNode[];
}

export type LegalNode = LegalParagraph | LegalTerm | LegalBullets | LegalClause;

export interface LegalSection {
  readonly number: string;
  readonly title: string;
  readonly content: readonly LegalNode[];
}

export interface LegalDocumentData {
  readonly title: string;
  readonly subtitle?: string;
  readonly sections: readonly LegalSection[];
}
