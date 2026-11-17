import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FALLBACK_CONTENT, getSiteContent } from "@/lib/api/site-content";
import { withFallback } from "@/lib/api/with-fallback";
import styles from "./page.module.css";
import { DonorSubscriptions } from "@/components/donation/DonorSubscriptions";

export const metadata: Metadata = { title: "Личный кабинет", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page() {
  const content = await withFallback(getSiteContent(), FALLBACK_CONTENT, "тексты сайта");
  return <>
    <SiteHeader phone={content.contacts.phone} />
    <main className={styles.main}>
      <header className={styles.heading}><h1>Личный кабинет</h1><p>Ваши автоплатежи и история списаний.</p></header>
      <DonorSubscriptions />
    </main>
    <SiteFooter contacts={content.contacts} />
  </>;
}
