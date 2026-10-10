import { DocumentsList } from "@/components/requisites/DocumentsList";
import { RequisitesTable } from "@/components/requisites/RequisitesTable";
import { DOCUMENTS, REQUISITES } from "@/lib/content";
import { BANK_DETAILS } from "@/lib/organization";
import type { BankDetails } from "@/lib/organization";

import styles from "./TwoColumns.module.css";

/** «Перевод по реквизитам» + «Документы» (макет v2). */
export function RequisitesSection({ bank = BANK_DETAILS }: { readonly bank?: BankDetails }) {
  return (
    <div className={`${styles.columns} ${styles.wideLeft}`}>
      <div>
        <h2 className={styles.title}>{REQUISITES.title}</h2>
        <RequisitesTable bank={bank} />
      </div>
      <div>
        <h2 className={styles.title}>{DOCUMENTS.title}</h2>
        <DocumentsList />
      </div>
    </div>
  );
}
