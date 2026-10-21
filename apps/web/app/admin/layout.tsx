import type { Metadata } from "next";

import { ToastProvider } from "@/components/admin/ui/Toasts";
import { AdminSessionProvider } from "@/lib/admin/session";

import "./admin.css";

/**
 * Корень админки. Серверный только ради metadata: сами страницы клиентские,
 * данные админки на сервере Next не рендерятся (D-05).
 * `noindex` дублирует заголовок `X-Robots-Tag` из next.config.ts.
 */
export const metadata: Metadata = {
  title: { default: "Админка", template: "%s · Админка" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-root">
      <AdminSessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminSessionProvider>
    </div>
  );
}
