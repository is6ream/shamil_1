import { StarOrnamentIcon } from "@/components/icons/Icons";
import { HADITH_BAND } from "@/lib/content";

import styles from "./HadithBand.module.css";

/**
 * Полоса с хадисом во всю ширину окна (макет v2).
 *
 * Текст — из lib/content.ts с пометкой TODO(имам): до выверки имамом
 * формулировки не меняются (CLAUDE.md, «Правила по контенту»).
 */
export function HadithBand() {
  return (
    <section className={`${styles.band} on-dark`} aria-label="Хадис о строительстве мечети">
      <div className={styles.inner}>
        <div className={styles.ornament} aria-hidden="true">
          <span className={styles.line} />
          <StarOrnamentIcon />
          <span className={styles.line} />
        </div>

        <blockquote className={styles.quote}>
          <p className={styles.arabic} lang="ar" dir="rtl">
            {HADITH_BAND.arabic}
          </p>
          <p className={styles.translation}>{HADITH_BAND.translation}</p>
        </blockquote>

        <p className={styles.source}>{HADITH_BAND.source}</p>
      </div>
    </section>
  );
}
