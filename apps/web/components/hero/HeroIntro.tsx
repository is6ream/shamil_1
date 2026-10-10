import { ShieldCheckIcon } from "@/components/icons/Icons";
import type { HeroContent } from "@/lib/api/site-content";
import type { Campaign } from "@/lib/api/types";
import { HERO } from "@/lib/content";

import { CollectedSummary } from "./CollectedSummary";
import styles from "./HeroIntro.module.css";
import { RenderCard } from "./RenderCard";

interface Props {
  /** `null` — бэкенд недоступен: вместо цифр «обновляем данные». */
  readonly campaign: Campaign | null;
  /** Тексты из админки; по умолчанию — хардкод `HERO`. */
  readonly hero?: HeroContent;
}

/**
 * Первый экран макета v2: бейдж, H1, лид, «Собрано», пункты доверия, рендер.
 *
 * Порядок на телефоне другой: доверие и рендер идут до «Собрано», чтобы
 * цифры сбора стояли прямо над формой. Меняет его CSS (`order`), а не
 * вторая копия разметки — один H1 на странице.
 */
export function HeroIntro({ campaign, hero = HERO }: Props) {
  return (
    <div className={styles.hero}>
      <p className={styles.badge}>
        <span className={styles.dot} aria-hidden="true" />
        {hero.badge}
      </p>

      <h1 className={styles.title}>{hero.title}</h1>

      <p className={styles.lede}>
        <span className={styles.desktopOnly}>{hero.lede}</span>
        <span className={styles.mobileOnly}>{hero.ledeShort}</span>
      </p>

      <CollectedSummary campaign={campaign} className={styles.collected} />

      <ul className={styles.trust}>
        {hero.trust.map((item) => (
          <li key={item}>
            <ShieldCheckIcon className={styles.shield} />
            {item}
          </li>
        ))}
      </ul>

      <div className={styles.render}>
        <RenderCard hero={hero} />
      </div>
    </div>
  );
}
