import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { ThanksScreen } from "@/components/status/ThanksScreen";
import { ORDER_QUERY_PARAM } from "@/lib/routes";

/**
 * Страница «спасибо». Путь зафиксирован бэкендом (`THANKS_PATH`
 * в apps/api/src/payments/payments.constants.ts) — менять его нельзя:
 * на него возвращает провайдер после оплаты.
 *
 * Из поисковой выдачи закрыта: это личный экран одного платежа, ему
 * нечего делать в индексе.
 */
export const metadata: Metadata = {
  title: "Спасибо за пожертвование",
  robots: { index: false, follow: false },
};

export default async function ThanksPage({ searchParams }: PageProps<"/spasibo">) {
  const params = await searchParams;
  const raw = params[ORDER_QUERY_PARAM];
  // Параметр может прийти массивом, если его подставили дважды.
  const orderId = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

  return (
    <>
      <SiteHeader />
      <main>
        <ThanksScreen orderId={orderId} />
      </main>
    </>
  );
}
