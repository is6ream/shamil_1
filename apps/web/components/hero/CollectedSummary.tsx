import { AnimatedTrack } from "@/components/goal/AnimatedTrack";
import type { Campaign } from "@/lib/api/types";
import { COLLECTED } from "@/lib/content";
import { formatCount, formatDayMonth, plural } from "@/lib/format";
import { kopecksToRubDisplay, kopecksToRubNumberDisplay, percentOfGoal } from "@/lib/money";

import styles from "./CollectedSummary.module.css";

interface Props {
  readonly campaign: Campaign;
  /** Вариант подписей: полный для десктопа, короткий для телефона (макет v2). */
  readonly className?: string;
}

const DONATION_FORMS = ["пожертвование", "пожертвования", "пожертвований"] as const;
const PAYMENT_FORMS = ["платёж", "платежа", "платежей"] as const;

/** «5,3» — десятые через запятую, как пишут по-русски. */
function formatPercent(percent: number): string {
  return String(percent).replace(".", ",");
}

/**
 * Блок «Собрано»: большая сумма, цель, прогресс-бар и строка под ним.
 *
 * На десктопе и телефоне подписи под шкалой разные (макет v2), поэтому
 * в разметке оба варианта, а показывает нужный CSS — без клиентского JS
 * и без расхождения при гидратации.
 */
export function CollectedSummary({ campaign, className }: Props) {
  const percent = percentOfGoal(campaign.collectedKopecks, campaign.goalKopecks);
  const percentText = `${formatPercent(percent)}%`;
  const count = formatCount(campaign.donationsCount);
  const date = campaign.lastPaidAt === null ? null : formatDayMonth(campaign.lastPaidAt);

  return (
    <div className={`${styles.summary} ${className ?? ""}`}>
      <p className={styles.label}>{COLLECTED.label}</p>

      <div className={styles.amounts}>
        <p className={styles.collected}>{kopecksToRubDisplay(campaign.collectedKopecks)}</p>
        <p className={styles.goal}>
          из <b>{kopecksToRubNumberDisplay(campaign.goalKopecks)}</b> ₽
        </p>
      </div>

      <AnimatedTrack percent={percent} label={`Собрано ${percentText} от цели`} />

      <div className={styles.meta}>
        <p className={styles.desktopOnly}>
          <b>{percentText}</b> от цели · <b>{count}</b>{" "}
          {plural(campaign.donationsCount, DONATION_FORMS)}
        </p>
        <p className={styles.mobileOnly}>
          <b>{percentText}</b> · <b>{count}</b> {plural(campaign.donationsCount, PAYMENT_FORMS)}
        </p>

        {date === null ? null : (
          <p className={styles.date}>
            <span className={styles.desktopOnly}>
              {COLLECTED.updatedPrefix} {date}
            </span>
            <span className={styles.mobileOnly}>на {date}</span>
          </p>
        )}
      </div>
    </div>
  );
}
