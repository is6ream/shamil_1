import Image from "next/image";

import { SBP_QR } from "@/lib/content";
import { SBP_PAYMENT } from "@/lib/organization";

import styles from "./SbpQrCard.module.css";

/**
 * Пожертвование по QR-коду СБП: код для камеры и кнопка с той же ссылкой.
 *
 * На компьютере человек сканирует QR телефоном. На телефоне — а это
 * основная аудитория, приходящая из WhatsApp, — свой экран не отсканировать,
 * поэтому первой идёт кнопка: ссылка `qr.nspk.ru` сама открывает выбор
 * банковского приложения.
 *
 * `unoptimized`: картинку выдал банк, пережатие сбивает контраст модулей
 * и ломает распознавание камерой.
 */
interface Props {
  /**
   * Карточка лежит на белом (аккордеон главной на телефоне) — тогда она
   * светло-серая, иначе белая сливалась бы с фоном.
   */
  readonly onWhite?: boolean;
}

export function SbpQrCard({ onWhite = false }: Props) {
  return (
    <section className={`${styles.card} ${onWhite ? styles.onWhite : ""}`} aria-labelledby="sbp-qr-title">
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

      <div className={styles.body}>
        <p className={styles.badge}>{SBP_QR.badge}</p>
        <h3 className={styles.title} id="sbp-qr-title">
          {SBP_QR.title}
        </h3>
        <p className={styles.text}>
          <span className={styles.desktopOnly}>{SBP_QR.textDesktop}</span>
          <span className={styles.mobileOnly}>{SBP_QR.textMobile}</span>
        </p>
        <a
          className={`btn btn-primary ${styles.button}`}
          href={SBP_PAYMENT.payUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {SBP_QR.button}
        </a>
      </div>
    </section>
  );
}
