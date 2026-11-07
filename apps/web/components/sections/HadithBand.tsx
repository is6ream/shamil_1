import Image from "next/image";

import { StarOrnamentIcon } from "@/components/icons/Icons";
import { HADITH_BAND } from "@/lib/content";

import styles from "./HadithBand.module.css";

/** Адаптивная полоса с хадисом. Согласованный текст берётся из lib/content.ts. */
export function HadithBand() {
  return (
    <section className={`${styles.band} on-dark`} aria-label="Хадис о строительстве мечети">
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.inner}>
        <Image
          className={styles.illustration}
          src="/hadith/steppe-gold-illustration.webp"
          unoptimized
          alt=""
          width={960}
          height={755}
          sizes="(min-width: 1328px) 560px, (min-width: 960px) 43vw, (min-width: 600px) 480px, calc(100vw - 64px)"
        />
        <figure className={styles.figure}>
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
          <figcaption className={styles.source}>
            <cite>{HADITH_BAND.source}</cite>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
