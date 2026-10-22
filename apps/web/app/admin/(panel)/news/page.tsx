"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminImage } from "@/components/admin/media/AdminImage";
import { NewsIcon } from "@/components/admin/ui/AdminIcons";
import { Badge } from "@/components/admin/ui/Blocks";
import { Pagination } from "@/components/admin/ui/DataTable";
import { Segmented } from "@/components/admin/ui/Segmented";
import type { SegmentOption } from "@/components/admin/ui/Segmented";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { newsPublicPath } from "@/lib/admin/news";
import { withQuery } from "@/lib/admin/query";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminNewsPost, NewsStatus, Paged } from "@/lib/admin/types";

import styles from "./news.module.css";

type StatusFilter = NewsStatus | "all";

const STATUS_OPTIONS: readonly SegmentOption<StatusFilter>[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновики" },
  { value: "published", label: "Опубликованные" },
];

/** Карточка новости: обложка, статус, дата, анонс и действия. */
function NewsCard({ post }: { readonly post: AdminNewsPost }) {
  const isPublished = post.status === "published";
  const editHref = `/admin/news/${post.id}`;

  return (
    <li className={styles.card}>
      <Link href={editHref} className={styles.cover} tabIndex={-1} aria-hidden="true">
        {post.cover ? (
          <AdminImage src={post.cover.urls.sm} alt="" width={post.cover.width} height={post.cover.height} />
        ) : (
          <span className={styles.coverEmpty}>
            <NewsIcon />
          </span>
        )}
      </Link>
      <div className={styles.cardBody}>
        <p className={styles.cardMeta}>
          {isPublished ? <Badge tone="success">Опубликовано</Badge> : <Badge>Черновик</Badge>}
          <span>
            {isPublished && post.publishedAt
              ? formatDateTime(post.publishedAt)
              : `изменено ${formatDateTime(post.updatedAt)}`}
          </span>
        </p>
        <h2 className={styles.cardTitle}>
          <Link href={editHref}>{post.title}</Link>
        </h2>
        {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}
        <div className={styles.cardActions}>
          <Link href={editHref} className="btn btn-ghost btn-sm">
            Редактировать
          </Link>
          {isPublished ? (
            <a href={newsPublicPath(post.slug)} target="_blank" rel="noopener noreferrer" className={styles.siteLink}>
              Открыть на сайте ↗
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function NewsListPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const path = withQuery(ADMIN_PATHS.news, {
    status: status === "all" ? undefined : status,
    page,
    pageSize: LIMITS.pageSize,
  });
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
        <Segmented
          label="Показать"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
        />
      </div>
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? (
        <EmptyState
          title={status === "all" ? "Новостей пока нет." : "Таких новостей нет."}
          action={
            <Link href="/admin/news/new" className="btn btn-primary btn-sm">
              Написать новость
            </Link>
          }
        >
          <p>Напишите первую — например, о заливке фундамента. Сначала она сохранится черновиком.</p>
        </EmptyState>
      ) : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <ul className={styles.cards} aria-label="Новости">
            {data.items.map((post) => (
              <NewsCard key={post.id} post={post} />
            ))}
          </ul>
          <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </>
      ) : null}
    </AdminPage>
  );
}
