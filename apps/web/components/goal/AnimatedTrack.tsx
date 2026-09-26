"use client";

import { useInViewOnce } from "@/lib/hooks/useInView";

import { ProgressTrack } from "./ProgressTrack";

interface Props {
  readonly percent: number;
  readonly label: string;
  readonly isThin?: boolean;
  readonly className?: string;
}

/**
 * Шкала, которая заполняется от нуля, когда попадает на экран.
 *
 * Без JS и до гидратации шкала уже стоит на своём значении; класс `in`
 * (kit.css) лишь проигрывает прокрутку. `prefers-reduced-motion` анимацию
 * отключает там же, в kit.css.
 */
export function AnimatedTrack({ percent, label, isThin, className }: Props) {
  const [ref, isInView] = useInViewOnce<HTMLDivElement>();
  const classes = [className, isInView ? "in" : undefined].filter(Boolean).join(" ");

  return (
    <div ref={ref}>
      <ProgressTrack percent={percent} label={label} isThin={isThin} className={classes} />
    </div>
  );
}
