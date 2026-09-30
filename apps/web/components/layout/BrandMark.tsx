import Image from "next/image";

import { BRAND } from "@/lib/content";

import styles from "./BrandMark.module.css";

interface Props {
  /** Подпись «Сбор на строительство · Уфа» — в шапке десктопа есть, в футере нет. */
  readonly hasTagline?: boolean;
  readonly size?: "md" | "lg";
}

/** Круглый знак группы «Мечеть Шамиль»; тот же файл — иконка вкладки (`app/icon.svg`). */
const LOGO_SRC = "/brand/logo.svg";

/**
 * Логотип: круглый знак мечети + «МЕЧЕТЬ ШАМИЛЬ».
 * Знак — `<img>`, а не инлайн-SVG: в файле свои id градиентов и масок,
 * при двух копиях на странице (шапка и футер) они бы конфликтовали.
 */
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
