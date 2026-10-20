"use client";

import { AdminPage } from "@/components/admin/AdminPage";
import { NewsEditor } from "@/components/admin/news/NewsEditor";

export default function NewNewsPage() {
  return (
    <AdminPage title="Новая новость" breadcrumbs={[{ href: "/admin/news", label: "Новости" }]} isWide>
      <NewsEditor post={null} onChanged={() => undefined} />
    </AdminPage>
  );
}
