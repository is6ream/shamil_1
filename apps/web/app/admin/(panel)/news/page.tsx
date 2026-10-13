"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/admin/ui/Blocks";
import { DataTable, Pagination } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { SelectField } from "@/components/admin/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminNewsPost, NewsStatus, Paged } from "@/lib/admin/types";

import styles from "./news.module.css";

const COLUMNS: readonly Column<AdminNewsPost>[] = [
  {
    key: "title",
    header: "Заголовок",
    render: (row) => <Link href={`/admin/news/${row.id}`}>{row.title}</Link>,
  },
  {
    key: "status",
    header: "Статус",
    render: (row) =>
      row.status === "published" ? <Badge tone="success">Опубликовано</Badge> : <Badge>Черновик</Badge>,
  },
  { key: "published", header: "Опубликовано", render: (row) => formatDateTime(row.publishedAt) },
  { key: "updated", header: "Изменено", render: (row) => formatDateTime(row.updatedAt) },
];

export default function NewsListPage() {
  const [status, setStatus] = useState<NewsStatus | "">("");
  const [page, setPage] = useState(1);
  const path = withQuery(ADMIN_PATHS.news, { status, page, pageSize: LIMITS.pageSize });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<AdminNewsPost>>(path);

  return (
    <AdminPage
      title="Новости"
      lead="Новости стройки на сайте: /novosti/… и список на странице «Отчёты». Пока опубликованных нет, на сайте этих блоков не видно."
      actions={
        <Link href="/admin/news/new" className="btn btn-primary">
          Написать новость
        </Link>
      }
    >
      <div className={styles.filter}>
        <SelectField
          label="Показать"
          emptyLabel="Все"
          options={[
            { value: "draft", label: "Черновики" },
            { value: "published", label: "Опубликованные" },
          ]}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as NewsStatus | "");
            setPage(1);
          }}
        />
      </div>
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? (
        <EmptyState title={status === "" ? "Новостей пока нет." : "Таких новостей нет."}>
          <p>Напишите первую — например, о заливке фундамента. Сначала она сохранится черновиком.</p>
        </EmptyState>
      ) : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <DataTable caption="Новости" columns={COLUMNS} rows={data.items} rowKey={(row) => row.id} />
          <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </>
      ) : null}
    </AdminPage>
  );
}
