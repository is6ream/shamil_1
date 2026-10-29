import { GirihDivider } from "@/components/ornament/GirihDivider";
import { GirihPattern } from "@/components/ornament/GirihPattern";
import { SHARE } from "@/lib/content";

import { ShareActions } from "./ShareActions";
import styles from "./SharePanel.module.css";

/**
 * Тёмная панель «Поделиться» (макет v2): слева цитата, справа кнопки.
 * Гирих и разделитель — как у полосы с хадисом; узор гаснет к центру,
 * под текстом и кнопками.
 *
 * Цитата — хадис о награде за указание на благое дело, с пометкой
 * TODO(имам) в lib/content.ts: формулировку не редактируем до выверки.
 */
export function SharePanel() {
  return (
    <div className={`${styles.panel} on-dark`}>
      <GirihPattern opacity={0.3} />

      <div className={styles.text}>
        <GirihDivider className={styles.divider} />
        <blockquote className={styles.quote}>
          <p>{SHARE.quote}</p>
        </blockquote>
        <p className={styles.lede}>{SHARE.lede}</p>
      </div>

      <ShareActions />
    </div>
  );
}
