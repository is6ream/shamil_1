import type { Campaign } from "@/lib/api/types";
import { formatCount, pluralize } from "@/lib/format";
import { clampPercent, kopecksToRubDisplay, percentOfGoal } from "@/lib/money";

import styles from "./WidgetStats.module.css";
import { ProgressTrack } from "../goal/ProgressTrack";

interface Props {
  readonly campaign: Campaign;
}

/**
 * Цифры сбора над формой: собрано, цель, число платежей.
 *
 * Шкала здесь одна и общая — месячная живёт в блоке «Цель», где ей есть
 * где объясниться. Дублировать обе значит отдать половину виджета цифрам
 * вместо формы.
 */
export function WidgetStats({ campaign }: Props) {
  const percent = percentOfGoal(campaign.collectedKopecks, campaign.goalKopecks);

  return (
    <section className={styles.stats} aria-label="Сколько собрано">
      <p className={styles.collected}>{kopecksToRubDisplay(campaign.collectedKopecks)}</p>
      <p className={styles.goal}>
        собрано из {kopecksToRubDisplay(campaign.goalKopecks)} — это{" "}
        {formatCount(Math.round(clampPercent(percent)))}% цели
      </p>

      <ProgressTrack
        className={styles.track}
        percent={percent}
        label="Собрано от общей цели"
        isThin
      />

      <p className={styles.meta}>
        <span>
          <b>{pluralize(campaign.donationsCount, ["платёж", "платежа", "платежей"])}</b>
        </span>
      </p>
    </section>
  );
}
