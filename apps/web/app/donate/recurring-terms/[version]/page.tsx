import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { RECURRING_PAYMENTS } from "@/lib/legal/recurring-payments";
import { SimplePage } from "@/components/layout/SimplePage";
import { EMAIL_TERMS_VERSION, RECURRING_TERMS_ARCHIVE } from "@/lib/recurring-terms";
import styles from "@/components/donation/SubscriptionManager.module.css";

export const metadata: Metadata = { title: "Условия регулярных пожертвований" };

export default async function Page({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (version === EMAIL_TERMS_VERSION) {
    return <SimplePage title={RECURRING_PAYMENTS.title} lede={RECURRING_PAYMENTS.subtitle}>
      <LegalDocument document={RECURRING_PAYMENTS} />
    </SimplePage>;
  }
  const terms = Object.hasOwn(RECURRING_TERMS_ARCHIVE, version) ? RECURRING_TERMS_ARCHIVE[version] : undefined;
  if (!terms) notFound();
  return <SimplePage title="Условия регулярных пожертвований" lede={`Версия ${version}`}>
    <p role="status">Ниже сохранена архивная редакция условий с доступом по секретному коду. Действующие правила оформления по email опубликованы в <Link href="/oferta#recurring-payments">публичной оферте</Link>.</p>
    <div className={styles.terms}>{terms.slice(1).map(text => <p key={text}>{text}</p>)}<Link href="/donate/subscription">Управление подпиской и отключение автосписаний</Link></div>
  </SimplePage>;
}
