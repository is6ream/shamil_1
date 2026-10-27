"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { AMOUNT_PRESETS_RUBLES } from "@/components/donation/donation-form.model";
import { ArrowRightIcon } from "@/components/icons/Icons";
import { ACTIVE_GOAL, PAGES } from "@/lib/content";
import { requestDonation } from "@/lib/donation-request";
import { formatRubles } from "@/lib/goal-progress";
import type { ActiveGoal } from "@/lib/goal-progress";
import { stageFigures } from "@/lib/stage-card";

import styles from "./StageCard.module.css";

interface StageCardProps {
  readonly goal: ActiveGoal;
  /** Превью в админке: кнопки и ссылка не действуют, анимации нет. */
  readonly isPreview?: boolean;
  readonly className?: string;
}

/**
 * Активный этап сбора на первом экране — белая карточка на синем hero:
 * название этапа, сумма, шкала, чипы сумм и «Другая сумма».
 *
 * Серверный HTML сразу содержит итог: шкала стоит на своём значении и без JS,
 * CSS-анимация лишь проигрывает заполнение от нуля. Чипы не дублируют форму —
 * они просят её открыться с суммой (`requestDonation`), выбирает пресет сама форма.
 */
export function StageCard({ goal, isPreview = false, className }: StageCardProps) {
  const figures = stageFigures(goal);
  const titleId = `stage-${goal.id}-title`;
  const valueText =
    figures.state === "empty" ? ACTIVE_GOAL.emptyValueText : `${figures.headline} ${figures.subline}`;
  const rootClass = [styles.card, isPreview ? styles.preview : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <section className={rootClass} aria-labelledby={titleId} data-state={figures.state}>
      <div className={styles.top}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{ACTIVE_GOAL.eyebrow}</p>
          <h2 className={styles.title} id={titleId}>
            {goal.title}
          </h2>
        </div>

        <div className={styles.figures}>
          <p className={styles.headline}>{figures.headline}</p>
          <p className={styles.subline}>{figures.subline}</p>
        </div>
      </div>

      <div
        className={styles.track}
        role="progressbar"
        aria-label={ACTIVE_GOAL.progressLabel(goal.title)}
        aria-valuenow={figures.percentValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
      >
        {figures.ratio > 0 ? (
          <span className={styles.fill} style={{ "--stage-ratio": figures.ratio } as CSSProperties} />
        ) : null}
      </div>

      <div className={styles.actions} role="group" aria-label={ACTIVE_GOAL.presetsLabel}>
        {AMOUNT_PRESETS_RUBLES.map((rubles) => (
          <button
            key={rubles}
            type="button"
            className={styles.chip}
            disabled={isPreview}
            onClick={() => requestDonation(rubles)}
          >
            {formatRubles(rubles)}
          </button>
        ))}

        <button type="button" className={styles.other} disabled={isPreview} onClick={() => requestDonation(null)}>
          {ACTIVE_GOAL.otherAmount}
          <ArrowRightIcon className={styles.otherIcon} aria-hidden="true" />
        </button>
      </div>

      <p className={styles.note}>
        {ACTIVE_GOAL.note}{" "}
        {isPreview ? (
          <span className={styles.noteLink}>{ACTIVE_GOAL.offerLink}</span>
        ) : (
          <Link href={PAGES.offer.href} className={styles.noteLink}>
            {ACTIVE_GOAL.offerLink}
          </Link>
        )}
      </p>
    </section>
  );
}
