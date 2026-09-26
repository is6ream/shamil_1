import { AnimatedTrack } from "@/components/goal/AnimatedTrack";
import type { RegionRankRow } from "@/lib/api/types";
import { kopecksToRubDisplay, percentOfGoal } from "@/lib/money";

import styles from "./RegionsBars.module.css";

interface Props {
  readonly regions: readonly RegionRankRow[];
}

/**
 * «География поддержки» (макет v2): строка региона, сумма и тонкий бар.
 * Ширина бара — доля от лидера, лидер = 100%: соревнование землячеств
 * читается по длине полос, а не по цифрам.
 */
export function RegionsBars({ regions }: Props) {
  const leader = regions[0];

  if (leader === undefined) {
    return null;
  }

  return (
    <ol className={styles.list}>
      {regions.map((region) => (
        <li className={styles.row} key={region.slug}>
          <div className={styles.head}>
            <span className={styles.name}>{region.name}</span>
            <span className={styles.amount}>{kopecksToRubDisplay(region.paidTotalKopecks)}</span>
          </div>
          <AnimatedTrack
            percent={percentOfGoal(region.paidTotalKopecks, leader.paidTotalKopecks)}
            label={`${region.name}: доля от лидера`}
          />
        </li>
      ))}
    </ol>
  );
}
