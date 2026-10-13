"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { NewsEditor } from "@/components/admin/news/NewsEditor";
import { ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { AdminNewsPost } from "@/lib/admin/types";

export default function EditNewsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, reload } = useAdminQuery<AdminNewsPost>(ADMIN_PATHS.newsPost(id));

  return (
    <AdminPage title={data?.title ?? "Новость"} actions={<Link href="/admin/news">← Все новости</Link>} isWide>
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <NewsEditor key={data.updatedAt} post={data} onChanged={reload} /> : null}
    </AdminPage>
  );
}
