import { linkify } from "@/lib/legal/linkify";
import type { LegalDocumentData, LegalNode, LegalSection } from "@/lib/legal/types";

import styles from "./LegalDocument.module.css";

interface Props {
  readonly document: LegalDocumentData;
}

/** Тело юридического документа: вводная часть, разделы, пункты, таблицы. */
export function LegalDocument({ document }: Props) {
  return (
    <article className={styles.doc}>
      {document.preamble === undefined ? null : (
        <div className={styles.preamble}>
          <LegalNodes nodes={document.preamble} />
        </div>
      )}
      {document.sections.map((section) => (
        <section key={section.number ?? section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{sectionHeading(section)}</h2>
          <LegalNodes nodes={section.content} />
        </section>
      ))}
    </article>
  );
}

function sectionHeading(section: LegalSection): string {
  return section.number === undefined ? section.title : `${section.number}. ${section.title}`;
}

function LegalNodes({ nodes }: { readonly nodes: readonly LegalNode[] }) {
  // Ключ с индексом: в документах заказчика встречаются повторы номеров пунктов.
  return nodes.map((node, index) => <LegalNodeView key={`${node.kind}-${index}`} node={node} />);
}

function LegalNodeView({ node }: { readonly node: LegalNode }) {
  switch (node.kind) {
    case "paragraph":
      return (
        <p className={styles.paragraph}>
          <LinkedText text={node.text} />
        </p>
      );

    case "term":
      return (
        <p className={styles.paragraph}>
          <strong>{node.term}</strong> — <LinkedText text={node.definition} />
        </p>
      );

    case "bullets": {
      const List = node.ordered === true ? "ol" : "ul";
      return (
        <List className={styles.bullets}>
          {node.items.map((item) => (
            <li key={item}>
              <LinkedText text={item} />
            </li>
          ))}
        </List>
      );
    }

    case "links":
      return (
        <ul className={styles.bullets}>
          {node.items.map((item) => (
            <li key={item.href}>
              <a href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {node.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    // data-label — подпись колонки, когда таблица на телефоне складывается в карточки.
                    <td key={cellIndex} data-label={node.columns[cellIndex]}>
                      <LegalNodes nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "clause":
      return (
        <div className={styles.clause}>
          <span className={styles.clauseNumber}>{node.number}.</span>
          <div className={styles.clauseBody}>
            {node.title === undefined ? null : <p className={styles.clauseTitle}>{node.title}</p>}
            <LegalNodes nodes={node.content} />
          </div>
        </div>
      );
  }
}

/** Текст, в котором адреса сайтов и почты становятся ссылками. */
function LinkedText({ text }: { readonly text: string }) {
  return linkify(text).map((chunk, index) =>
    chunk.kind === "text" ? (
      chunk.value
    ) : (
      <a
        key={index}
        className={styles.inlineLink}
        href={chunk.href}
        {...(chunk.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {chunk.value}
      </a>
    ),
  );
}
