import { notFound } from "next/navigation";

import { CancelSubscription } from "@/components/donor/CancelSubscription";
import { DONOR_CABINET_ENABLED } from "@/lib/donor/endpoints";

export const metadata = {
  title: "Отмена регулярного пожертвования",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
} as const;

export default async function Page({ searchParams }: {
  readonly searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (!DONOR_CABINET_ENABLED) notFound();
  const { token } = await searchParams;
  return <CancelSubscription token={typeof token === "string" && token.length <= 128 ? token : null} />;
}
