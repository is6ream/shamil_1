import type { BuildProgress, GalleryItem } from "@/lib/api/types";
import { formatDayMonth } from "@/lib/format";

import styles from "./BuildSection.module.css";

interface Props {
  readonly progress: BuildProgress;
  readonly gallery: readonly GalleryItem[];
}

const STAGE_MARKS = ["✓", "⏳", "○"] as const;

/**
 * Ход строительства и галерея.
 *
 * Текстовый чек-лист — добавка сверх ТЗ. Он отвечает на немой вопрос
 * «деньги точно идут на стройку?» лучше фотографий и, в отличие от них,
 * индексируется поисковиками.
 *
 * Порядок фотографий — хронологический, с самых первых этапов: заливка
 * фундамента вызывает доверие сильнее готовых стен (требование ТЗ).
 * Дата на каждом снимке — часть доказательства, а не подпись.
 */
export function BuildSection({ progress, gallery }: Props) {
  const stages = [progress.done, progress.current, progress.upcoming];

  return (
    <section id="build">
      <div className="card">
        <div className="eyebrow">обновлено {formatDayMonth(progress.updatedAt)}</div>
        <h2>Ход строительства</h2>
        <p className="sub">Так выглядит ответ на вопрос «а деньги точно доходят до стройки»</p>

        <div className="progress-cols">
          {stages.map((stage, index) => (
            <div className="pcol" key={stage.title}>
              <div className="n">{stage.items.length}</div>
              <div className="t">
                {STAGE_MARKS[index]} {stage.title}
              </div>
              <ul>
                {stage.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className={styles.galleryTitle}>От первой сваи до купола</h3>

        <div className="gal">
          {gallery.map((item) => (
            <figure className="shot" key={item.id}>
              {/* Настоящих фотографий стройки ещё нет — блокер из CLAUDE.md.
                  До них плашка с датой: выдумывать стройку нечем, а пустая
                  сетка читается как сломанный блок.
                  Требования к съёмке — docs/design/photos.md. */}
              {item.url === null ? (
                <figcaption className={styles.pending}>{item.caption}</figcaption>
              ) : null}
              <span>{item.takenAtLabel}</span>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
