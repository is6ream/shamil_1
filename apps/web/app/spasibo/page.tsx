import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { ThanksScreen } from "@/components/status/ThanksScreen";
import { ORDER_QUERY_PARAM, PROVIDER_ORDER_QUERY_PARAM } from "@/lib/routes";

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

/** Параметр может прийти массивом, если его подставили дважды. */
function firstValue(raw: string | string[] | undefined): string | null {
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

export default async function ThanksPage({ searchParams }: PageProps<"/spasibo">) {
  const params = await searchParams;
  // `order_id` ставит наш сайт (ручной перевод), `Shp_order_id` возвращает
  // Robokassa с Success URL — у неё свой формат параметров.
  const orderId =
    firstValue(params[ORDER_QUERY_PARAM]) ?? firstValue(params[PROVIDER_ORDER_QUERY_PARAM]);

  return (
    <>
      <SiteHeader />
      <main>
        <ThanksScreen orderId={orderId} />
      </main>
    </>
  );
}
