"use client";

import { useEffect, useState } from "react";

import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./CollectedSummary.module.css";

const DURATION_MS = 800;
const PROGRESS_STEPS = 10_000;

export function CollectedCounter({ kopecks }: { readonly kopecks: string }) {
  const total = kopecksToRubDisplay(kopecks);
  const [target] = useState(() => BigInt(kopecks));
  const [frameText, setFrameText] = useState<string | null>(() =>
    target > 0n ? kopecksToRubDisplay(0) : null,
  );

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (target <= 0n) return;

    let startedAt: number | undefined;
    let frameId: number;

    function tick(now: number) {
      startedAt ??= now;
      const elapsed = now - startedAt;
      if (elapsed >= DURATION_MS || motion.matches) {
        setFrameText(null);
        return;
      }

      const progress = 1 - (1 - elapsed / DURATION_MS) ** 3;
      const steps = BigInt(Math.floor(progress * PROGRESS_STEPS));
      const amount = (target * steps) / BigInt(PROGRESS_STEPS);
      const displayAmount = target < 100n ? amount : (amount / 100n) * 100n;
      setFrameText(kopecksToRubDisplay(displayAmount.toString()));
      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [target]);

  return (
    <span className={styles.counter}>
      <span className={frameText === null ? undefined : styles.counterTotal}>{total}</span>
      {frameText !== null && (
        <span className={styles.counterFrame} aria-hidden="true">{frameText}</span>
      )}
    </span>
  );
}
