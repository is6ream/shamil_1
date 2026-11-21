"use client";

import { useEffect, useState } from "react";

import { ProgressTrack } from "@/components/goal/ProgressTrack";
import type { Campaign } from "@/lib/api/types";
import { MOBILE_BAR, SECTION_IDS } from "@/lib/content";
import { useSectionVisible } from "@/lib/hooks/useSectionVisible";
import { kopecksToRubDisplay, kopecksToRubNumberDisplay, percentOfGoal } from "@/lib/money";
import { scrollToSection, sectionHref } from "@/lib/scroll-to-section";

import styles from "./MobileDonateBar.module.css";

interface Props {
  readonly campaign: Campaign | null;
  readonly heroId: string;
}

/**
 * Нижняя sticky-плашка телефона (макет v2): собрано из цели, мини-шкала
 * и «Пожертвовать» — к форме.
 *
 * Появляется после вводного блока и скрывается, пока видна форма.
 */
export function MobileDonateBar({ campaign, heroId }: Props) {
  const [isPastHero, setPastHero] = useState(false);
  const isFormVisible = useSectionVisible(SECTION_IDS.donate, 0);
  const isHidden = !isPastHero || isFormVisible;

  useEffect(() => {
    const hero = document.getElementById(heroId);
    if (hero === null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setPastHero(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroId]);

  return (
    <div className={styles.bar} data-hidden={isHidden} inert={isHidden}>
      {campaign === null ? null : (
        <div className={styles.summary}>
          <p className={styles.amounts}>
            <b>{kopecksToRubDisplay(campaign.collectedKopecks)}</b> {MOBILE_BAR.of}{" "}
            {kopecksToRubNumberDisplay(campaign.goalKopecks)}&nbsp;₽
          </p>
          <ProgressTrack
            percent={percentOfGoal(campaign.collectedKopecks, campaign.goalKopecks)}
            label="Собрано от цели"
            isThin
          />
        </div>
      )}

      <a
        className={`btn btn-primary ${styles.button}`}
        href={sectionHref(SECTION_IDS.donate)}
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
