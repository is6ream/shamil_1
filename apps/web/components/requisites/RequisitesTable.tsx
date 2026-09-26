"use client";

import { CopyIcon } from "@/components/icons/Icons";
import { Toast } from "@/components/ui/Toast";
import { REQUISITES } from "@/lib/content";
import { useCopy } from "@/lib/hooks/useCopy";
import { BANK_DETAILS, ORGANIZATION, PAYMENT_PURPOSE } from "@/lib/organization";

import styles from "./RequisitesTable.module.css";

interface Row {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
}

/** Строки в порядке макета v2. */
const ROWS: readonly Row[] = [
  { key: "recipient", label: "Получатель", value: ORGANIZATION.legalName },
  { key: "inn", label: "ИНН", value: ORGANIZATION.inn },
  { key: "bank", label: "Банк", value: BANK_DETAILS.bankName },
  { key: "account", label: "Расчётный счёт", value: BANK_DETAILS.accountNumber },
  { key: "bik", label: "БИК", value: BANK_DETAILS.bik },
  { key: "corr", label: "Корр. счёт", value: BANK_DETAILS.correspondentAccount },
  { key: "purpose", label: "Назначение", value: PAYMENT_PURPOSE },
];

/**
 * Таблица реквизитов с копированием каждой строки (макет v2).
 *
 * НЕИЗВЕСТНОЕ НЕ ВЫДУМЫВАЕМ: значение `null` из lib/organization.ts
 * показывается как «Уточняется», и кнопки копирования у него нет. Нули
 * и номера-заглушки из макета в вёрстку не переносятся — номер счёта
 * из воздуха на странице оплаты означает деньги, ушедшие в никуда.
 */
export function RequisitesTable() {
  const { copiedKey, hasFailed, copy } = useCopy();
  const toast = copiedKey !== null ? REQUISITES.copied : hasFailed ? "Не удалось скопировать" : null;

  return (
    <>
      <dl className={styles.table}>
        {ROWS.map((row) => (
          <div className={styles.row} key={row.key}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>
              {row.value === null ? (
                <span className={styles.pending}>{REQUISITES.pending}</span>
              ) : (
                <>
                  <span className={styles.text}>{row.value}</span>
                  <button
                    className={styles.copy}
                    type="button"
                    aria-label={`Скопировать ${row.label.toLowerCase()}`}
                    data-copied={copiedKey === row.key ? "true" : undefined}
                    onClick={() => {
                      void copy(row.key, row.value ?? "");
                    }}
                  >
                    <CopyIcon />
                  </button>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Toast message={toast} />
    </>
  );
}
