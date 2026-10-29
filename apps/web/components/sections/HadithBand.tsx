import { GirihPattern } from "@/components/ornament/GirihPattern";
import { GirihDivider } from "@/components/ornament/GirihDivider";
import { HADITH_BAND } from "@/lib/content";

import styles from "./HadithBand.module.css";

/**
 * Полоса с хадисом во всю ширину окна: гирих по краям, золотая рамка.
 *
 * Текст — из lib/content.ts с пометкой TODO(имам): до выверки имамом
 * формулировки не меняются (CLAUDE.md, «Правила по контенту»).
 */
export function HadithBand() {
  const [firstLine, secondLine] = HADITH_BAND.translationLines;

  return (
    <section className={`${styles.band} on-dark`} aria-label="Хадис о строительстве мечети">
      <GirihPattern />
      <div className={styles.frame} aria-hidden="true" />

      <div className={styles.inner}>
        <GirihDivider />

        <figure className={styles.figure}>
          <blockquote className={styles.quote}>
            <p className={styles.arabic} lang="ar" dir="rtl">
              {HADITH_BAND.arabic}
            </p>
            <p className={styles.translation}>
              {firstLine}
              <br className={styles.break} />
              {` ${secondLine}`}
            </p>
          </blockquote>
          <figcaption className={styles.source}>
            <cite>{HADITH_BAND.source}</cite>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
