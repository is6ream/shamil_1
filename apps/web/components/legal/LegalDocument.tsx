import type { LegalDocumentData, LegalNode } from "@/lib/legal/types";

import styles from "./LegalDocument.module.css";

interface Props {
  readonly document: LegalDocumentData;
}

/** Тело юридического документа: разделы, нумерованные пункты, термины. */
export function LegalDocument({ document }: Props) {
  return (
    <article className={styles.doc}>
      {document.sections.map((section) => (
        <section key={section.number} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {section.number}. {section.title}
          </h2>
          <LegalNodes nodes={section.content} />
        </section>
      ))}
    </article>
  );
}

function LegalNodes({ nodes }: { readonly nodes: readonly LegalNode[] }) {
  return nodes.map((node, index) => <LegalNodeView key={nodeKey(node, index)} node={node} />);
}

function LegalNodeView({ node }: { readonly node: LegalNode }) {
  switch (node.kind) {
    case "paragraph":
      return <p className={styles.paragraph}>{node.text}</p>;

    case "term":
      return (
        <p className={styles.paragraph}>
          <strong>{node.term}</strong> — {node.definition}
        </p>
      );

    case "bullets":
      return (
        <ul className={styles.bullets}>
          {node.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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

function nodeKey(node: LegalNode, index: number): string {
  return node.kind === "clause" ? node.number : `${node.kind}-${index}`;
}
