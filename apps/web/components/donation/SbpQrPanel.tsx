import Image from "next/image";

import { SBP_QR } from "@/lib/content";
import { SBP_PAYMENT } from "@/lib/organization";

import styles from "./SbpQrPanel.module.css";

interface Props {
  readonly id: string;
}

/**
 * Пожертвование по QR СБП прямо в карточке формы — основной путь,
 * пока не подключена Robokassa (решение 19.10.2026).
 *
 * На десктопе главное — сам код: человек сканирует его телефоном. На
 * телефоне свой экран не отсканировать, поэтому первой идёт кнопка с той
 * же ссылкой `qr.nspk.ru`, она открывает выбор банковского приложения.
 *
 * `unoptimized`: картинку выдал банк, пережатие сбивает контраст модулей.
 */
export function SbpQrPanel({ id }: Props) {
  return (
    <div className={styles.panel} id={id} role="tabpanel" aria-labelledby="donation-mode-qr">
      <div className={styles.qrWrap}>
        <Image
          className={styles.qr}
          src={SBP_PAYMENT.qrImageUrl}
          alt="QR-код СБП для пожертвования на строительство мечети"
          width={720}
          height={720}
          unoptimized
        />
      </div>

      <p className={styles.text}>
        <span className={styles.desktopOnly}>{SBP_QR.textDesktop}</span>
        <span className={styles.mobileOnly}>{SBP_QR.textMobile}</span>
      </p>

      <a
        className={`btn btn-primary btn-block ${styles.button}`}
        href={SBP_PAYMENT.payUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {SBP_QR.button}
      </a>

      <p className={styles.note}>{SBP_QR.note}</p>
    </div>
  );
}
