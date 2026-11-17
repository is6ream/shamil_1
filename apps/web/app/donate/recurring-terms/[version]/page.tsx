import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";
import { RECURRING_TERMS_ARCHIVE } from "@/lib/recurring-terms";
import styles from "@/components/donation/SubscriptionManager.module.css";

export const metadata: Metadata = { title: "Условия регулярных пожертвований" };

export default async function Page({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const terms = Object.hasOwn(RECURRING_TERMS_ARCHIVE, version) ? RECURRING_TERMS_ARCHIVE[version] : undefined;
  if (!terms) notFound();
  return <SimplePage title="Условия регулярных пожертвований" lede={`Версия ${version}`}>
    <p role="status">Подключение новых автоплатежей и автоматические списания пока отключены. Ниже сохранена архивная редакция условий с доступом по секретному коду. Сейчас вход в личный кабинет работает по email. Обновлённые условия будут доступны до открытия оформления; эта страница не создаёт подписку и не запрашивает согласие на списания.</p>
    <div className={styles.terms}>{terms.slice(1).map(text => <p key={text}>{text}</p>)}<Link href="/donate/subscription">Управление подпиской и отключение автосписаний</Link></div>
  </SimplePage>;
}
