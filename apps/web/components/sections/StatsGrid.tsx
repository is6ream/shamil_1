import type { Campaign } from "@/lib/api/types";
import { STATS } from "@/lib/content";
import { formatCount } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./StatsGrid.module.css";

interface Props {
  readonly campaign: Campaign;
  /**
   * Сколько регионов и стран уже в рейтинге.
   *
   * TODO(api): сейчас это длина топа (≤ 10). Точное число ненулевых регионов
   * лучше прислать полем `GET /regions/top` вместе с `emptyCount`.
   */
  readonly regionsCount: number;
}

interface Stat {
  readonly value: string;
  readonly label: string;
}

/**
 * Сетка 2×2 под рендером (макет v2). Ячейка без данных не показывается:
 * «0 человек помогают каждый месяц» читается как провал.
 */
export function StatsGrid({ campaign, regionsCount }: Props) {
  const stats: readonly Stat[] = [
    { value: kopecksToRubDisplay(campaign.collectedKopecks), label: STATS.collected },
    { value: formatCount(campaign.donationsCount), label: STATS.donations },
    { value: formatCount(regionsCount), label: STATS.regions },
    ...(campaign.monthlyDonorsCount === null
      ? []
      : [{ value: formatCount(campaign.monthlyDonorsCount), label: STATS.monthlyDonors }]),
  ];

  return (
    <dl className={styles.grid}>
      {stats.map((stat) => (
        <div className={styles.cell} key={stat.label}>
          <dt className={styles.label}>{stat.label}</dt>
          <dd className={styles.value}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
