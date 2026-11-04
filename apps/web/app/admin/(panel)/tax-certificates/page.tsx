"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Pagination } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { FormErrors, SelectField, TextAreaField } from "@/components/admin/ui/Field";
import type { SelectOption } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { formatKopecks } from "@/lib/admin/money";
import { withQuery } from "@/lib/admin/query";
import { formatDate } from "@/lib/admin/time";
import type { AdminTaxCertificate, Paged, TaxCertificateStatus } from "@/lib/admin/types";

const PAGE_SIZE = 25;
const COMMENT_MAX_LENGTH = 500;

const STATUS_LABELS: Readonly<Record<TaxCertificateStatus, string>> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готова",
};

const STATUS_TONES = { NEW: "warning", IN_PROGRESS: "info", DONE: "success" } as const;

const STATUS_OPTIONS: readonly SelectOption[] = (Object.keys(STATUS_LABELS) as TaxCertificateStatus[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

function isStatus(value: string): value is TaxCertificateStatus {
  return value in STATUS_LABELS;
}

const COLUMNS: readonly Column<AdminTaxCertificate>[] = [
  { key: "year", header: "Год", render: (row) => row.year },
  {
    key: "donor",
    header: "Жертвователь",
    render: (row) => (
      <>
        <b>{row.donorName ?? "ФИО не указаны"}</b>
        <br />
        {row.donorEmail ?? "почты нет"}
        {row.donorPhone === null ? null : `, ${row.donorPhone}`}
      </>
    ),
  },
  {
    key: "paid",
    header: "Оплачено за год",
    isNumeric: true,
    render: (row) => `${formatKopecks(row.paidTotalKopecks)} · ${row.paidCount}`,
  },
  { key: "created", header: "Подана", render: (row) => formatDate(row.createdAt) },
  {
    key: "status",
    header: "Статус",
    render: (row) => (
      <>
        <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
        {row.adminComment === null ? null : (
          <>
            <br />
            {row.adminComment}
          </>
        )}
      </>
    ),
  },
];

/**
 * Заявки на справку для налогового вычета из кабинета жертвователя —
 * для бухгалтера и суперадмина. PDF сайт не делает: бухгалтер готовит
 * справку сам и отмечает здесь статус; комментарий виден жертвователю.
 * Сумма — только пожертвования, сделанные из кабинета.
 */
export default function TaxCertificatesPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminTaxCertificate | null>(null);
  const path = withQuery(ADMIN_PATHS.taxCertificates, { status: status === "" ? undefined : status, page, pageSize: PAGE_SIZE });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<AdminTaxCertificate>>(path);

  const columns: readonly Column<AdminTaxCertificate>[] = [
    ...COLUMNS,
    {
      key: "action",
      header: "",
      render: (row) => (
        <Button variant="ghost" isSmall onClick={() => setEditing(row)}>
          Изменить
        </Button>
      ),
    },
  ];

  return (
    <AdminPage
      title="Справки для вычета"
      lead="Заявки жертвователей на справку для налогового вычета. Отметьте статус, когда справка готова, — комментарий увидит жертвователь в кабинете."
      isWide
    >
      <SelectField
        label="Статус"
        emptyLabel="Все"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
      />

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? <EmptyState title="Заявок нет." /> : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <DataTable caption="Заявки на справку" columns={columns} rows={data.items} rowKey={(row) => row.id} />
          <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </>
      ) : null}

      <Modal isOpen={editing !== null} title="Заявка на справку" onClose={() => setEditing(null)} isDismissible>
        {editing === null ? null : (
          <EditForm
            request={editing}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
    </AdminPage>
  );
}

function EditForm({ request, onSaved }: { readonly request: AdminTaxCertificate; readonly onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<TaxCertificateStatus>(request.status);
  const [comment, setComment] = useState(request.adminComment ?? "");
  const save = useAdminMutation((client, body: { status: TaxCertificateStatus; adminComment: string }) =>
    client.request(ADMIN_PATHS.taxCertificate(request.id), { method: "PATCH", body }),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if ((await save.run({ status, adminComment: comment })) !== undefined) {
      toast.success("Заявка сохранена.");
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p>
        {request.donorName ?? "ФИО не указаны"}, справка за {request.year} год.
      </p>
      <SelectField
        label="Статус"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) => {
          if (isStatus(event.target.value)) {
            setStatus(event.target.value);
          }
        }}
      />
      <TextAreaField
        label="Комментарий жертвователю"
        hint="Например: «Отправили на почту 12.02». Пустое поле — без комментария."
        value={comment}
        maxLength={COMMENT_MAX_LENGTH}
        onChange={(event) => setComment(event.target.value)}
      />
      <FormErrors messages={save.errors} />
      <Button type="submit" isBusy={save.isPending}>
        Сохранить
      </Button>
    </form>
  );
}
