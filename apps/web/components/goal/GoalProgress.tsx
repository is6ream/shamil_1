"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { ArrowRightIcon, CheckMarkIcon } from "@/components/icons/Icons";
import { ACTIVE_GOAL, PAGES, SECTION_IDS } from "@/lib/content";
import { easeOutCubic, formatRubles, goalSummaryText, kopecksToWholeRubles } from "@/lib/goal-progress";
import type { ActiveGoal } from "@/lib/goal-progress";
import { useInViewOnce } from "@/lib/hooks/useInView";
import { scrollToSection } from "@/lib/scroll-to-section";

import styles from "./GoalProgress.module.css";

/** Полоса, сумма и процент — одна длительность и одна кривая (`easeOutCubic` ↔ CSS). */
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
 * Активный этап сбора на первом экране: «Текущий этап — На кровлю»,
 * сумма и процент над стеклянной полосой, под ней — подпись про оферту.
 *
 * Серверный HTML сразу содержит итог: без JS и до гидратации полоса и цифры
 * верные. Когда блок впервые попадает на экран, один цикл requestAnimationFrame
 * ведёт от нуля полосу (`transform: scaleX`), сумму и процент — синхронно,
 * по одной кривой. Состояние React при этом не меняется: кадры пишутся в DOM
 * напрямую, без перерисовки компонента 60 раз в секунду. `prefers-reduced-motion` —
 * сразу итог, блик и свечение края выключает CSS.
 */
export function GoalProgress({ goal, isPreview = false, className }: Props) {
  const [ref, isInView] = useInViewOnce<HTMLElement>(0.3);
  const fillRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);
  const amountRef = useRef<HTMLElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);

  const collectedRubles = kopecksToWholeRubles(goal.collectedAmountKopecks);
  const targetRubles = kopecksToWholeRubles(goal.targetAmountKopecks);
  const { percent } = goal;
  const ratio = percent / 100;
  const collectedText = formatRubles(collectedRubles);

  useEffect(() => {
    const fill = fillRef.current;
    const edge = edgeRef.current;
    const amount = amountRef.current?.firstChild ?? null;
    // У достигнутой цели процента на экране нет — вместо него бейдж.
    const percentText = percentRef.current?.firstChild ?? null;

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
      if (percentText !== null) {
        percentText.nodeValue = String(Math.round(percent * eased));
      }

      if (eased < 1) {
        frame = requestAnimationFrame(draw);
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      // Прерванная анимация не должна оставить полосу и цифры на полпути.
      fill.style.transform = "";
      edge.style.transform = "";
      amount.nodeValue = formatRubles(collectedRubles);
      if (percentText !== null) {
        percentText.nodeValue = String(percent);
      }
    };
  }, [isInView, isPreview, ratio, percent, collectedRubles]);

  const label = `${ACTIVE_GOAL.eyebrow}: ${goal.title}. Собрано ${percent}% от ${formatRubles(targetRubles)}`;
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
          {goal.description ? <p className={styles.description}>{goal.description}</p> : null}
        </div>

        {isPreview ? (
          <span className={styles.cta} aria-hidden="true">
            {ACTIVE_GOAL.cta}
            <ArrowRightIcon className={styles.ctaIcon} />
          </span>
        ) : (
          <button type="button" className={styles.cta} onClick={() => scrollToSection(SECTION_IDS.donate)}>
            {ACTIVE_GOAL.cta}
            <ArrowRightIcon className={styles.ctaIcon} />
          </button>
        )}
      </div>

      <div className={styles.figures}>
        <p className={styles.amount}>
          <span className={styles.collectedLabel}>{ACTIVE_GOAL.collected} </span>
          <b ref={amountRef}>{collectedText}</b>{" "}
          <span className={styles.target}>
            {ACTIVE_GOAL.of} {formatRubles(targetRubles)}
          </span>
        </p>

        {goal.isReached ? (
          <p className={styles.badge}>
            <CheckMarkIcon className={styles.badgeIcon} />
            {ACTIVE_GOAL.reached}
          </p>
        ) : (
          <p className={styles.percent}>
            <span ref={percentRef}>{percent}</span>
            <small>%</small>
          </p>
        )}
      </div>

      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={goalSummaryText(goal)}
      >
        <span ref={fillRef} className={styles.fill} />
        <span ref={edgeRef} className={styles.edgeLayer} aria-hidden="true">
          <i className={styles.edge} />
        </span>
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
