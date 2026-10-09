import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { EmptyState } from "@/components/admin/ui/StateViews";
import { sectionBySlug } from "@/lib/admin/navigation";

/**
 * Заглушка разделов, экраны которых ждут API (REPORT-frontend.md).
 * Готовый раздел получает свою папку, и статический маршрут перекрывает этот.
 */
export default async function PendingSectionPage({ params }: PageProps<"/admin/[section]">) {
  const { section: slug } = await params;
  const section = sectionBySlug(slug);

  if (section === undefined || section.isReady) {
    notFound();
  }

  return (
    <AdminPage title={section.label}>
      <EmptyState title="Раздел появится, когда будет готов сервер админки.">
        <p>Сейчас можно сменить пароль и посмотреть структуру меню.</p>
      </EmptyState>
    </AdminPage>
  );
}
