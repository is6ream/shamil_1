import Link from "next/link";
import type { MouseEvent } from "react";

import { Badge } from "@/components/admin/ui/Blocks";
import { DataTable } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { canConfirmTransfer, isAmountMismatch } from "@/lib/admin/donations";
import { DONATION_STATUS_LABELS, methodLabel, providerLabel } from "@/lib/admin/labels";
import { formatKopecks } from "@/lib/admin/money";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminDonation, DonationStatus } from "@/lib/admin/types";

import styles from "./donations.module.css";

const STATUS_TONES = { pending: "warning", paid: "success", failed: "danger" } as const;

export function DonationStatusBadge({ status }: { readonly status: DonationStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{DONATION_STATUS_LABELS[status]}</Badge>;
}

function AmountCell({ donation }: { readonly donation: AdminDonation }) {
  if (donation.paidAmountKopecks === null) {
    return <>{formatKopecks(donation.amountKopecks)}</>;
  }

  if (!isAmountMismatch(donation)) {
    return <>{formatKopecks(donation.paidAmountKopecks)}</>;
  }

  return (
    <span className={styles.mismatch} title="Оплачено не столько, сколько заказано">
      {formatKopecks(donation.paidAmountKopecks)}
      <small>заказ {formatKopecks(donation.amountKopecks)}</small>
    </span>
  );
}

function DonorCell({ donation }: { readonly donation: AdminDonation }) {
  const signature = donation.isAnonymous || donation.donorName === null ? "Анонимно" : donation.donorName;
  const contact = donation.contact;

  return (
    <span className={styles.stacked}>
      {signature}
      {contact?.fullName ? <small>Для сверки: {contact.fullName}</small> : null}
      {contact?.phone ? <small>Тел.: {contact.phone}</small> : null}
    </span>
  );
}

function UtmCell({ donation }: { readonly donation: AdminDonation }) {
  const { source, campaign } = donation.utm;

  if (source === null && campaign === null) {
    return <span className={styles.muted}>—</span>;
  }

  return (
    <span className={styles.stacked}>
      {source ?? "—"}
      {campaign ? <small>{campaign}</small> : null}
    </span>
  );
}

/** Обычный клик — панель над списком; с Ctrl/Cmd/Shift и средней кнопкой — как ссылка, в новой вкладке. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function columns(onOpen: (id: string) => void): readonly Column<AdminDonation>[] {
  const open = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (isPlainClick(event)) {
      event.preventDefault();
      onOpen(id);
    }
  };

  return [
  {
    key: "invoice",
    header: "№ счёта",
    render: (row) => (
      <Link href={`/admin/donations/${row.id}`} className={styles.invoiceLink} onClick={open(row.id)}>
        № {row.invoiceNo}
        {row.adminComment ? (
          <span className={styles.commentMark} title="Есть комментарий" aria-label="есть комментарий">
            ✎
          </span>
        ) : null}
      </Link>
    ),
  },
  {
    key: "status",
    header: "Статус",
    render: (row) =>
      canConfirmTransfer(row) ? (
        <span className={styles.stacked}>
          <DonationStatusBadge status={row.status} />
          <Link href={`/admin/donations/${row.id}`} className={styles.rowAction} onClick={open(row.id)}>
            Подтвердить перевод
          </Link>
        </span>
      ) : (
        <DonationStatusBadge status={row.status} />
      ),
  },
  { key: "amount", header: "Сумма", isNumeric: true, render: (row) => <AmountCell donation={row} /> },
  {
    key: "method",
    header: "Способ",
    render: (row) => (
      <span className={styles.stacked}>
        {methodLabel(row.method)}
        <small>{providerLabel(row.provider)}</small>
      </span>
    ),
  },
  {
    key: "dates",
    header: "Создан / оплачен",
    render: (row) => (
      <span className={styles.stacked}>
        {formatDateTime(row.createdAt)}
        {row.paidAt ? <small>оплачен {formatDateTime(row.paidAt)}</small> : null}
      </span>
    ),
  },
  { key: "region", header: "Регион", render: (row) => row.region?.name ?? <span className={styles.muted}>—</span> },
  { key: "donor", header: "Жертвователь", render: (row) => <DonorCell donation={row} /> },
  { key: "utm", header: "Источник (UTM)", render: (row) => <UtmCell donation={row} /> },
  ];
}

interface Props {
  readonly rows: readonly AdminDonation[];
  /** Открыть карточку панелью поверх списка. */
  readonly onOpen: (id: string) => void;
}

export function DonationsTable({ rows, onOpen }: Props) {
  return <DataTable caption="Пожертвования" columns={columns(onOpen)} rows={rows} rowKey={(row) => row.id} />;
}
