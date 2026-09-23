import type { Metadata } from "next";
import Link from "next/link";

import { BankDetails } from "@/components/donation/BankDetails";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ShareLinks } from "@/components/share/ShareLinks";
import { ORDER_QUERY_PARAM, THANKS_PATH, buildOrderUrl } from "@/lib/routes";

import styles from "./page.module.css";

/**
 * Реквизиты и QR СБП. Путь зафиксирован бэкендом (`MANUAL_TRANSFER_PATH`
 * в apps/api/src/payments/payments.constants.ts): именно сюда уводит
 * `ManualProvider`, когда активен ручной приём.
 *
 * Ручной перевод — постоянный способ оплаты, а не заглушка: часть
 * жертвователей принципиально не платит картой онлайн. Он же запасной путь
 * всего проекта на случай, если мерчант-аккаунт не успеет пройти модерацию.
 */
export const metadata: Metadata = {
  title: "Перевод по реквизитам",
  robots: { index: false, follow: false },
};

export default async function TransferPage({ searchParams }: PageProps<"/donate/transfer">) {
  const params = await searchParams;
  const raw = params[ORDER_QUERY_PARAM];
  const orderId = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

  return (
    <>
      <SiteHeader />

      <main className={styles.page}>
        <h1 className={styles.title}>Перевод по реквизитам</h1>
        <p className={styles.lede}>
          Переведите сумму со своего счёта или через приложение банка. Как только
          деньги придут, мы отметим пожертвование, и оно попадёт в сумму сбора
          и в рейтинг регионов.
        </p>

        {orderId === null ? (
          <p className={styles.note}>
            Номера платежа в ссылке нет. Ничего страшного: укажите в назначении
            перевода «Пожертвование на строительство мечети» — мы найдём поступление
            по выписке.
          </p>
        ) : (
          <p className={styles.note}>
            Обязательно укажите номер платежа в назначении перевода — по нему мы
            сопоставим ваши деньги с пожертвованием.
          </p>
        )}

        <div className="card">
          <BankDetails orderId={orderId ?? undefined} />
        </div>

        <div className={styles.actions}>
          {orderId === null ? null : (
            <a className="btn btn-ghost" href={buildOrderUrl(THANKS_PATH, orderId)}>
              Проверить статус платежа
            </a>
          )}
          <Link className="btn btn-ghost" href="/">
            Вернуться к сбору
          </Link>
        </div>

        <div className={styles.shareBox}>
          <h2>Пока перевод в пути — расскажите о сборе</h2>
          <ShareLinks highlightFirst />
        </div>
      </main>
    </>
  );
}
