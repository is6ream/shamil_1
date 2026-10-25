"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { loginHref } from "@/lib/admin/login";
import { ADMIN_HOME, ADMIN_LOGIN, findSection } from "@/lib/admin/navigation";
import { ROLE_LABELS } from "@/lib/admin/roles";
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
    // Сессия кончилась или её не было: на вход, а после входа — обратно сюда.
    // Вышел сам — просто на вход.
    if (state.status === "anonymous") {
      router.replace(state.reason === "logout" ? ADMIN_LOGIN : loginHref(`${pathname}${window.location.search}`));
    }
  }, [state, router, pathname]);

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
          <EmptyState
            title={`Раздел «${section?.label ?? ""}» недоступен для роли «${ROLE_LABELS[state.user.role]}».`}
            action={<Link href={ADMIN_HOME}>Вернуться к обзору</Link>}
          >
            Если доступ нужен по работе, попросите суперадмина сменить вам роль в разделе «Пользователи».
          </EmptyState>
        </AdminPage>
      )}
    </AdminShell>
  );
}
