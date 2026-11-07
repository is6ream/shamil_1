import Image from "next/image";

import { BRAND } from "@/lib/content";

import styles from "./BrandMark.module.css";

interface Props {
  /** Подпись «Сбор на строительство · Уфа» — в шапке десктопа есть, в футере нет. */
  readonly hasTagline?: boolean;
  readonly size?: "md" | "lg";
}

/** Золотой знак мечети из изображения заказчика; иконки браузера созданы из того же исходника. */
const LOGO_SRC = "/brand/logo-gold.webp";

export function BrandMark({ hasTagline = false, size = "md" }: Props) {
  return (
    <span className={`${styles.brand} ${size === "lg" ? styles.lg : ""}`}>
      <Image
        className={styles.circle}
        src={LOGO_SRC}
        alt=""
        width={76}
        height={76}
        unoptimized
      />
      <span className={styles.text}>
        <span className={styles.name}>{BRAND.name}</span>
        {hasTagline ? <span className={styles.tagline}>{BRAND.tagline}</span> : null}
      </span>
    </span>
  );
}
