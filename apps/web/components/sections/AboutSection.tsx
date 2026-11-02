import Image from "next/image";

import type { AboutContent } from "@/lib/api/site-content";
import { ABOUT, SECTION_IDS } from "@/lib/content";
import styles from "./AboutSection.module.css";

/** Эскиз проекта с приглашением поддержать строительство. */
export function AboutSection({ about = ABOUT }: { readonly about?: AboutContent }) {
  const facts = about.facts.filter((fact) => fact.value !== null);

  return (
    <section className={styles.section} id={SECTION_IDS.about} aria-labelledby="about-title">
      <Image
        className={styles.image}
        src="/about/mosque-evening.png"
        alt="Архитектурный эскиз мечети с синим куполом и освещённым минаретом"
        fill
        sizes="(max-width: 767px) 100vw, 720px"
      />
      <span className={styles.caption}>{about.facadeCaption}</span>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{about.eyebrow}</p>
        <h2 className={styles.title} id="about-title">{about.title}</h2>
        <p className={styles.text}>
          {about.text ?? "Сегодня вы видите образ будущей мечети. Помогите воплотить его в жизнь — чтобы здесь собирались люди и звучала общая молитва."}
        </p>
        <a className={styles.cta} href={`#${SECTION_IDS.donate}`}>Помочь построить мечеть <span aria-hidden="true">↗</span></a>
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div className={styles.fact} key={fact.value}>
              <dt className={styles.factLabel}>{fact.label ?? "Место строительства"}</dt>
              <dd className={styles.factValue}>{fact.value}{fact.unit === undefined ? null : <> {fact.unit}</>}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
