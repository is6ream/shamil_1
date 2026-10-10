"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_LOGIN, findSection } from "@/lib/admin/navigation";
import { useAdminSession } from "@/lib/admin/session";

/**
 * Защищённая часть админки. Проверка только для интерфейса: без сессии
 * уводим на вход, без права — показываем отказ. Настоящая проверка — на API.
 */
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  const { state, can } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace(ADMIN_LOGIN);
    }
  }, [state.status, router]);

  if (state.status === "unavailable") {
    return (
      <AdminPage title="Не удалось проверить вход">
        <ErrorState message={state.message} onRetry={() => window.location.reload()} />
      </AdminPage>
    );
  }

  if (state.status !== "authenticated") {
    return <LoadingState label="Проверяем вход…" />;
  }

  const section = findSection(pathname);
  const isAllowed = section?.permission == null || can(section.permission);

  return (
    <AdminShell user={state.user}>
      {isAllowed ? (
        children
      ) : (
        <AdminPage title="Нет доступа">
          <EmptyState title="Этот раздел недоступен для вашей роли." />
        </AdminPage>
      )}
    </AdminShell>
  );
}
