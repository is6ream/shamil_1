import { SHARE } from "@/lib/content";

import { ShareActions } from "./ShareActions";
import styles from "./SharePanel.module.css";

/**
 * Тёмная панель «Поделиться» (макет v2): слева цитата, справа кнопки.
 *
 * Цитата — хадис о награде за указание на благое дело, с пометкой
 * TODO(имам) в lib/content.ts: формулировку не редактируем до выверки.
 */
export function SharePanel() {
  return (
    <div className={`${styles.panel} on-dark`}>
      <svg className={styles.ornament} viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <rect x="40" y="40" width="120" height="120" stroke="currentColor" />
        <rect
          x="40"
          y="40"
          width="120"
          height="120"
          stroke="currentColor"
          transform="rotate(45 100 100)"
        />
        <circle cx="100" cy="100" r="28" stroke="currentColor" />
      </svg>

      <div className={styles.text}>
        <blockquote className={styles.quote}>
          <p>{SHARE.quote}</p>
        </blockquote>
        <p className={styles.lede}>{SHARE.lede}</p>
      </div>

      <ShareActions />
    </div>
  );
}
