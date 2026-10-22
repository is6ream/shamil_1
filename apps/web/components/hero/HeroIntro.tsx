import { GoalProgress } from "@/components/goal/GoalProgress";
import { ShieldCheckIcon } from "@/components/icons/Icons";
import type { HeroContent } from "@/lib/api/site-content";
import type { Campaign } from "@/lib/api/types";
import type { ActiveGoal } from "@/lib/goal-progress";
import { HERO } from "@/lib/content";

import { CollectedSummary } from "./CollectedSummary";
import styles from "./HeroIntro.module.css";

interface Props {
  /** `null` — бэкенд недоступен: вместо цифр «обновляем данные». */
  readonly campaign: Campaign | null;
  /** Тексты из админки; по умолчанию — хардкод `HERO`. */
  readonly hero?: HeroContent;
  /** Активный этап сбора; `null` — этапа нет или API недоступен, блок не рисуется. */
  readonly goal?: ActiveGoal | null;
}

/**
 * Первый экран макета v2: бейдж, H1, лид, «Собрано», пункты доверия.
 * Рендер мечети теперь не карточка, а фон экрана — см. `HeroBackdrop`.
 *
 * Порядок на телефоне другой: доверие идёт до «Собрано», чтобы
 * цифры сбора стояли прямо над формой. Меняет его CSS (`order`), а не
 * вторая копия разметки — один H1 на странице.
 *
 * Активный этап сбора стоит сразу под «Собрано»: на десктопе форма справа
 * его не касается, на телефоне он последним перед формой и компактен.
 */
export function HeroIntro({ campaign, hero = HERO, goal = null }: Props) {
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

      {goal === null ? null : <GoalProgress goal={goal} className={styles.goal} />}

      <ul className={styles.trust}>
        {hero.trust.map((item) => (
          <li key={item}>
            <ShieldCheckIcon className={styles.shield} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
