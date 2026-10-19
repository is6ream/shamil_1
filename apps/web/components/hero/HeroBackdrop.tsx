import Image from "next/image";

import heroBackground from "@/public/hero/hero-bg.jpg";

import styles from "./HeroBackdrop.module.css";

interface Props {
  readonly className?: string;
}

/**
 * Фон первого экрана во всю ширину окна: рендер мечети в синей тонировке.
 *
 * Картинка декоративная (`alt=""`): смысл экрана несут заголовок и цифры.
 * Статический импорт даёт размеры и blur-плейсхолдер без ручных чисел;
 * `preload` — это самая крупная картинка первого экрана (LCP).
 * Кадрирование под разные экраны — в CSS через `object-position`.
 */
export function HeroBackdrop({ className }: Props) {
  return (
    <div className={`${styles.backdrop} ${className ?? ""}`} aria-hidden="true">
      <div className={styles.frame}>
        <Image
          className={styles.image}
          src={heroBackground}
          alt=""
          fill
          preload
          placeholder="blur"
          sizes="100vw"
        />
        <span className={styles.shade} />
      </div>
    </div>
  );
}
