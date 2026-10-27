import { RequisitesTable } from "@/components/requisites/RequisitesTable";
import { SbpQrCard } from "@/components/requisites/SbpQrCard";
import { REQUISITES } from "@/lib/content";
import { BANK_DETAILS } from "@/lib/organization";
import type { BankDetails } from "@/lib/organization";

import styles from "./TwoColumns.module.css";

/** «Перевод по реквизитам»: QR СБП + таблица реквизитов. */
export function RequisitesSection({ bank = BANK_DETAILS }: { readonly bank?: BankDetails }) {
  return (
    <div>
      <h2 className={styles.title}>{REQUISITES.title}</h2>
      <SbpQrCard onWhite />
      <RequisitesTable bank={bank} />
    </div>
  );
}
