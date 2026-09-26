import { BRAND } from "@/lib/content";

import styles from "./BrandMark.module.css";
import { MosqueMark } from "./MosqueMark";

interface Props {
  /** Подпись «Сбор на строительство · Уфа» — в шапке десктопа есть, в футере нет. */
  readonly hasTagline?: boolean;
  readonly size?: "md" | "lg";
}

/**
 * Логотип: круглый синий знак мечети + «МЕЧЕТЬ ШАМИЛЬ».
 *
 * TODO(заказчик): логотип группы в векторе (`public/brand/logo.svg`).
 * До него в круге стоит линейный `MosqueMark`; замена — в одном файле.
 */
export function BrandMark({ hasTagline = false, size = "md" }: Props) {
  return (
    <span className={`${styles.brand} ${size === "lg" ? styles.lg : ""}`}>
      <span className={styles.circle} aria-hidden="true">
        <MosqueMark />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{BRAND.name}</span>
        {hasTagline ? <span className={styles.tagline}>{BRAND.tagline}</span> : null}
      </span>
    </span>
  );
}
