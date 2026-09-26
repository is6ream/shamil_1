import Image from "next/image";

import { Eyebrow } from "@/components/ui/Eyebrow";
import { ABOUT, SECTION_IDS } from "@/lib/content";
import type { ProjectFact } from "@/lib/content";

import styles from "./AboutSection.module.css";

/** Факт без значения — плейсхолдер макета, его не показываем. */
function isKnown(fact: ProjectFact): fact is ProjectFact & { readonly value: string } {
  return fact.value !== null;
}

/**
 * «О проекте» (макет v2): заголовок, абзац от заказчика, арка с эскизом
 * фасада и сетка фактов. На телефоне блока нет — как в макете.
 *
 * Абзац и неизвестные факты — `null` в lib/content.ts и не выводятся:
 * «[ГОД]» или «[S] м²» на живом сайте хуже пустого места.
 */
export function AboutSection() {
  const facts = ABOUT.facts.filter(isKnown);

  return (
    <section className={styles.section} id={SECTION_IDS.about} aria-labelledby="about-title">
      <Eyebrow>{ABOUT.eyebrow}</Eyebrow>
      <h2 className={styles.title} id="about-title">
        {ABOUT.title}
      </h2>
      {ABOUT.text === null ? null : <p className={styles.text}>{ABOUT.text}</p>}

      <div className={styles.body}>
        <figure className={styles.arch}>
          {ABOUT.facadeUrl === null ? null : (
            <Image
              className={styles.image}
              src={ABOUT.facadeUrl}
              alt={ABOUT.facadeCaption}
              fill
              sizes="260px"
            />
          )}
          <figcaption className={styles.caption}>{ABOUT.facadeCaption}</figcaption>
        </figure>

        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div className={styles.fact} key={fact.value}>
              <dt className={styles.factLabel}>{fact.label ?? ""}</dt>
              <dd className={styles.factValue}>
                {fact.value}
                {fact.unit === undefined ? null : <> {fact.unit}</>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
