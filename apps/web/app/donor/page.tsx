import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";
import { DonorSubscriptions } from "@/components/donation/DonorSubscriptions";
import { SubscriptionManager } from "@/components/donation/SubscriptionManager";
export const metadata: Metadata = { title: "Личный кабинет жертвователя", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() {
 return <SimplePage title="Личный кабинет жертвователя" lede="Состояние регулярных пожертвований, история платежей и отмена будущих списаний."><DonorSubscriptions /><details><summary>Доступ к прежней подписке по секретному коду</summary><SubscriptionManager /></details></SimplePage>;
}
