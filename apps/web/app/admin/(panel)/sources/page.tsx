"use client";

import { AdminPage } from "@/components/admin/AdminPage";
import { SourcesReport } from "@/components/admin/sources/SourcesReport";

/** Отчёт по источникам: откуда приходят оплаченные пожертвования. */
export default function SourcesPage() {
  return (
    <AdminPage
      title="Источники"
      lead="Откуда пришли люди, которые пожертвовали: Telegram, Instagram, QR на баннере, поиск. Только оплаченные пожертвования."
      isWide
    >
      <SourcesReport />
    </AdminPage>
  );
}
