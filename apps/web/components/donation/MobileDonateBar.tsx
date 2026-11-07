"use client";

import { ProgressTrack } from "@/components/goal/ProgressTrack";
import type { Campaign } from "@/lib/api/types";
import { MOBILE_BAR, SECTION_IDS } from "@/lib/content";
import { useSectionVisible } from "@/lib/hooks/useSectionVisible";
import { kopecksToRubDisplay, kopecksToRubNumberDisplay, percentOfGoal } from "@/lib/money";
import { scrollToSection, sectionHref } from "@/lib/scroll-to-section";

import styles from "./MobileDonateBar.module.css";

interface Props {
  readonly campaign: Campaign;
}

/**
 * Нижняя sticky-плашка телефона (макет v2): собрано из цели, мини-шкала
 * и «Пожертвовать» — к форме.
 *
 * Прячется, пока форма на экране: вторая кнопка поверх первой только
 * загораживает поля. На планшете и десктопе её нет — там форма видна
 * с первого экрана.
 */
export function MobileDonateBar({ campaign }: Props) {
  const isFormVisible = useSectionVisible(SECTION_IDS.donate);

  const percent = percentOfGoal(campaign.collectedKopecks, campaign.goalKopecks);

  return (
    <div className={styles.bar} data-hidden={isFormVisible ? "true" : "false"} aria-hidden={isFormVisible}>
      <div className={styles.summary}>
        <p className={styles.amounts}>
          <b>{kopecksToRubDisplay(campaign.collectedKopecks)}</b> {MOBILE_BAR.of}{" "}
          {kopecksToRubNumberDisplay(campaign.goalKopecks)}&nbsp;₽
        </p>
        <ProgressTrack percent={percent} label="Собрано от цели" isThin />
      </div>

      <a
        className={`btn btn-primary ${styles.button}`}
        href={sectionHref(SECTION_IDS.donate)}
        tabIndex={isFormVisible ? -1 : undefined}
        onClick={(event) => {
          if (scrollToSection(SECTION_IDS.donate)) {
            event.preventDefault();
          }
        }}
      >
        {MOBILE_BAR.donate}
      </a>
    </div>
  );
}
