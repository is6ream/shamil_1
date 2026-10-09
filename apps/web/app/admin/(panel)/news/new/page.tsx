"use client";

import Link from "next/link";

import { AdminPage } from "@/components/admin/AdminPage";
import { NewsEditor } from "@/components/admin/news/NewsEditor";

export default function NewNewsPage() {
  return (
    <AdminPage title="Новая новость" actions={<Link href="/admin/news">← Все новости</Link>} isWide>
      <NewsEditor post={null} onChanged={() => undefined} />
    </AdminPage>
  );
}
