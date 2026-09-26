import { FileIcon } from "@/components/icons/Icons";
import { DOCUMENTS } from "@/lib/content";
import { ORGANIZATION } from "@/lib/organization";

import styles from "./DocumentsList.module.css";

/**
 * Уставные документы (макет v2). Для сбора на 240 млн — не опция: без них
 * на виду сбор выглядит как мошеннический (CLAUDE.md).
 *
 * Документа ещё нет (`url: null`) — строка неактивна и честно помечена
 * «скоро»: битая ссылка на устав хуже честного «готовится».
 */
export function DocumentsList() {
  return (
    <ul className={styles.list}>
      {ORGANIZATION.documents.map((document) => (
        <li key={document.title}>
          {document.url === null ? (
            <span className={`${styles.item} ${styles.pending}`}>
              <FileIcon className={styles.icon} />
              <span className={styles.title}>{document.title}</span>
              <span className={styles.tag}>{DOCUMENTS.soon}</span>
            </span>
          ) : (
            <a className={styles.item} href={document.url} target="_blank" rel="noopener">
              <FileIcon className={styles.icon} />
              <span className={styles.title}>{document.title}</span>
              <span className={styles.tag}>{DOCUMENTS.pdf}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
