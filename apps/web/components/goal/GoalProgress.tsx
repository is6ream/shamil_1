"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { ACTIVE_GOAL, PAGES, SECTION_IDS } from "@/lib/content";
import { easeOutCubic, formatRubles, goalSummaryText, kopecksToWholeRubles } from "@/lib/goal-progress";
import type { ActiveGoal } from "@/lib/goal-progress";
import { useInViewOnce } from "@/lib/hooks/useInView";
import { scrollToSection } from "@/lib/scroll-to-section";

import styles from "./GoalProgress.module.css";

/** Полоса и счётчик — одна длительность и одна кривая (`easeOutCubic` ↔ CSS). */
const FILL_DURATION_MS = 1200;

interface Props {
  readonly goal: ActiveGoal;
  /** Превью в админке: без анимации, кнопка неактивна, ссылки не ведут со страницы. */
  readonly isPreview?: boolean;
  readonly className?: string;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Активный этап сбора на первом экране: «Текущий этап — На кирпичи»,
 * тонкая стеклянная полоса и «Собрано X ₽ из Y ₽ · N%».
 *
 * Серверный HTML сразу содержит итог: без JS и до гидратации полоса и сумма
 * верные. Когда блок впервые попадает на экран, один цикл requestAnimationFrame
 * ведёт от нуля и полосу (`transform: scaleX`), и сумму — синхронно, по одной
 * кривой. Состояние React при этом не меняется: кадры пишутся в DOM напрямую,
 * без перерисовки компонента 60 раз в секунду. `prefers-reduced-motion` —
 * сразу итог, бегущий блик и свечение края выключает CSS.
 */
export function GoalProgress({ goal, isPreview = false, className }: Props) {
  const [ref, isInView] = useInViewOnce<HTMLElement>(0.3);
  const fillRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);
  const amountRef = useRef<HTMLElement>(null);

  const collectedRubles = kopecksToWholeRubles(goal.collectedAmountKopecks);
  const targetRubles = kopecksToWholeRubles(goal.targetAmountKopecks);
  const ratio = goal.percent / 100;
  const collectedText = formatRubles(collectedRubles);

  useEffect(() => {
    const fill = fillRef.current;
    const edge = edgeRef.current;
    const amount = amountRef.current?.firstChild ?? null;

    if (!isInView || isPreview || fill === null || edge === null || amount === null || prefersReducedMotion()) {
      return;
    }

    let frame = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const eased = easeOutCubic((now - started) / FILL_DURATION_MS);

      fill.style.transform = `scaleX(${ratio * eased})`;
      edge.style.transform = `translateX(${(ratio * eased - 1) * 100}%)`;
      amount.nodeValue = formatRubles(Math.round(collectedRubles * eased));

      if (eased < 1) {
        frame = requestAnimationFrame(draw);
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      // Прерванная анимация не должна оставить полосу на полпути.
      fill.style.transform = "";
      edge.style.transform = "";
      amount.nodeValue = formatRubles(collectedRubles);
    };
  }, [isInView, isPreview, ratio, collectedRubles]);

  const label = `${ACTIVE_GOAL.eyebrow}: ${goal.title}. Собрано ${goal.percent}% от ${formatRubles(targetRubles)}`;
  const titleId = `goal-${goal.id}-title`;

  return (
    <section
      ref={ref}
      className={`${styles.goal}${goal.isReached ? ` ${styles.reached}` : ""}${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      style={{ "--goal-ratio": ratio } as CSSProperties}
    >
      <div className={styles.head}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{ACTIVE_GOAL.eyebrow}</p>
          <h2 className={styles.title} id={titleId}>
            {goal.title}
          </h2>
        </div>

        {isPreview ? (
          <span className={styles.cta} aria-hidden="true">
            {ACTIVE_GOAL.cta}
          </span>
        ) : (
          <button type="button" className={styles.cta} onClick={() => scrollToSection(SECTION_IDS.donate)}>
            {ACTIVE_GOAL.cta}
          </button>
        )}
      </div>

      {goal.description ? <p className={styles.description}>{goal.description}</p> : null}

      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuenow={goal.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={goalSummaryText(goal)}
      >
        <span ref={fillRef} className={styles.fill} />
        <span ref={edgeRef} className={styles.edgeLayer} aria-hidden="true">
          <i className={styles.edge} />
        </span>
      </div>

      <p className={styles.meta}>
        {goal.isReached ? <b className={styles.badge}>{ACTIVE_GOAL.reached}</b> : null}
        <span>
          Собрано <b ref={amountRef}>{collectedText}</b> из {formatRubles(targetRubles)} · <b>{goal.percent}%</b>
        </span>
      </p>

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
