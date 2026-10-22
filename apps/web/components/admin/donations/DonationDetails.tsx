import { ConfirmTransferForm } from "@/components/admin/donations/ConfirmTransferForm";
import { DonationStatusBadge } from "@/components/admin/donations/DonationsTable";
import { Badge, KeyValueList, Section } from "@/components/admin/ui/Blocks";
import type { KeyValueRow } from "@/components/admin/ui/Blocks";
import { DataTable } from "@/components/admin/ui/DataTable";
import { canConfirmTransfer, isAmountMismatch } from "@/lib/admin/donations";
import { DONATION_STATUS_LABELS, methodLabel, providerLabel } from "@/lib/admin/labels";
import { formatKopecks } from "@/lib/admin/money";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminDonationDetails, DonationStatus, PaymentEventRecord } from "@/lib/admin/types";

import styles from "./donations.module.css";

const REGION_SOURCE_LABELS = { link: "по ссылке", form: "выбран в форме", admin: "внесён в админке" } as const;

function eventStatusLabel(status: string): string {
  return status in DONATION_STATUS_LABELS ? DONATION_STATUS_LABELS[status as DonationStatus] : status;
}

function text(value: string | null) {
  return value ?? "—";
}

function mainRows(donation: AdminDonationDetails): KeyValueRow[] {
  const mismatch = isAmountMismatch(donation);

  return [
    { label: "Статус", value: <DonationStatusBadge status={donation.status} /> },
    { label: "Сумма заказа", value: formatKopecks(donation.amountKopecks) },
    {
      label: "Оплачено",
      value: mismatch ? (
        <>
          {formatKopecks(donation.paidAmountKopecks)} <Badge tone="warning">не совпадает с заказом</Badge>
        </>
      ) : (
        formatKopecks(donation.paidAmountKopecks)
      ),
    },
    { label: "Валюта", value: donation.currency },
    { label: "Способ", value: methodLabel(donation.method) },
    { label: "Провайдер", value: providerLabel(donation.provider) },
    { label: "Создан", value: formatDateTime(donation.createdAt) },
    { label: "Оплачен", value: formatDateTime(donation.paidAt) },
    {
      label: "Регион",
      value: donation.region
        ? `${donation.region.name}${donation.regionSource ? ` (${REGION_SOURCE_LABELS[donation.regionSource]})` : ""}`
        : "—",
    },
    { label: "Подпись на сайте", value: donation.isAnonymous ? "Анонимно" : text(donation.donorName) },
    { label: "Комментарий", value: text(donation.adminComment) },
  ];
}

function personalRows(donation: AdminDonationDetails): KeyValueRow[] {
  return [
    { label: "Имя для сверки", value: text(donation.contact?.fullName ?? null) },
    { label: "Телефон", value: text(donation.contact?.phone ?? null) },
    { label: "Согласие на обработку ПДн", value: formatDateTime(donation.contact?.consentAt ?? null) },
  ];
}

function sourceRows(donation: AdminDonationDetails): KeyValueRow[] {
  const { utm } = donation;

  return [
    { label: "utm_source", value: text(utm.source) },
    { label: "utm_medium", value: text(utm.medium) },
    { label: "utm_campaign", value: text(utm.campaign) },
    { label: "utm_content", value: text(utm.content) },
    { label: "utm_term", value: text(utm.term) },
    { label: "Откуда пришёл (referrer)", value: text(donation.referrer) },
    { label: "Страница входа", value: text(donation.landingPage) },
  ];
}

const EVENT_COLUMNS = [
  { key: "received", header: "Получено", render: (row: PaymentEventRecord) => formatDateTime(row.receivedAt) },
  { key: "provider", header: "Источник", render: (row: PaymentEventRecord) => providerLabel(row.provider) },
  { key: "status", header: "Статус", render: (row: PaymentEventRecord) => eventStatusLabel(row.status) },
  {
    key: "amount",
    header: "Сумма",
    isNumeric: true,
    render: (row: PaymentEventRecord) => formatKopecks(row.amountKopecks),
  },
  {
    key: "applied",
    header: "Результат",
    render: (row: PaymentEventRecord) =>
      row.appliedAt === null ? <Badge>повтор, без изменений</Badge> : <Badge tone="success">применено</Badge>,
  },
];

interface Props {
  readonly donation: AdminDonationDetails;
  /** После подтверждения перевода — перечитать карточку и список. */
  readonly onChanged: () => void;
}

/** Карточка пожертвования: отдельная страница и боковая панель над списком. */
export function DonationDetails({ donation, onChanged }: Props) {
  return (
    <>
      {canConfirmTransfer(donation) ? (
        <Section title="Подтвердить перевод по реквизитам">
          <ConfirmTransferForm donation={donation} onConfirmed={onChanged} />
        </Section>
      ) : null}
      <Section title="Платёж">
        <KeyValueList rows={mainRows(donation)} />
      </Section>
      <Section title={donation.contactMasked ? "Данные жертвователя (скрыты для вашей роли)" : "Данные жертвователя"}>
        <KeyValueList rows={personalRows(donation)} />
      </Section>
      <Section title="Откуда пришёл">
        <KeyValueList rows={sourceRows(donation)} />
      </Section>
      <Section title="История платежа">
        {donation.events.length === 0 ? (
          <p className={styles.muted}>Событий от платёжной системы нет.</p>
        ) : (
          <div className={styles.events}>
            <DataTable caption="События платежа" columns={EVENT_COLUMNS} rows={donation.events} rowKey={(row) => row.id} />
          </div>
        )}
      </Section>
    </>
  );
}
