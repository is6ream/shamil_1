import { StageCard } from "@/components/goal/StageCard";
import type { HeroContent } from "@/lib/api/site-content";
import type { Campaign } from "@/lib/api/types";
import type { ActiveGoal } from "@/lib/goal-progress";
import { HERO } from "@/lib/content";

import { CollectedSummary } from "./CollectedSummary";
import { InterviewPreview } from "./InterviewPreview";
import styles from "./HeroIntro.module.css";

interface Props {
  readonly campaign: Campaign | null;
  readonly hero?: HeroContent;
  readonly goal?: ActiveGoal | null;
}

export function HeroIntro({ campaign, hero = HERO, goal = null }: Props) {
  const title = hero.title.split("«Шамиль»");

  return (
    <div className={styles.hero}>
      <div className={styles.scene}>
        <p className={styles.badge}>
          <span className={styles.dot} aria-hidden="true" />
          {hero.badge}
        </p>

        <h1 className={styles.title}>
          {title.length === 2 ? <>{title[0]}<em>«Шамиль»</em>{title[1]}</> : hero.title}
        </h1>

        <p className={styles.lede}>
          <span className={styles.desktopOnly}>{hero.lede}</span>
          <span className={styles.mobileOnly}>{hero.ledeShort}</span>
        </p>
      </div>

      <InterviewPreview />
      <CollectedSummary campaign={campaign} />
      {goal === null ? null : <StageCard goal={goal} className={styles.goal} compactOnMobile />}
    </div>
  );
}
