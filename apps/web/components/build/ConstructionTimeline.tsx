import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon, CheckMarkIcon } from "@/components/icons/Icons";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { ConstructionStage, ConstructionTimeline as Timeline, GalleryItem } from "@/lib/api/types";
import { CONSTRUCTION, PAGES } from "@/lib/content";
import { formatDayMonth } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./ConstructionTimeline.module.css";
import { VideoCard } from "./VideoCard";

interface Props {
  readonly timeline: Timeline;
  readonly gallery: readonly GalleryItem[];
}

/** Сколько превью фото под видео (макет v2). */
const PREVIEW_COUNT = 3;

function StageMarker({ stage, index }: { readonly stage: ConstructionStage; readonly index: number }) {
  if (stage.status === "done") {
    return (
      <span className={`${styles.marker} ${styles.markerDone}`} aria-hidden="true">
        <CheckMarkIcon />
      </span>
    );
  }

  if (stage.status === "current") {
    return <span className={`${styles.marker} ${styles.markerCurrent}`} aria-hidden="true" />;
  }

  return (
    <span className={`${styles.marker} ${styles.markerUpcoming}`} aria-hidden="true">
      {index + 1}
    </span>
  );
}

/**
 * «Куда идут пожертвования» (макет v2): вертикальный таймлайн из семи
 * этапов, видео с объекта, превью фото и ссылка на галерею.
 *
 * Отвечает на немой вопрос «деньги точно идут на стройку?» и, в отличие
 * от фотографий, индексируется поисковиками. Заголовок на телефоне
 * скрыт — его роль там играет строка аккордеона.
 */
export function ConstructionTimeline({ timeline, gallery }: Props) {
  const previews = gallery.slice(0, PREVIEW_COUNT);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <Eyebrow>{CONSTRUCTION.eyebrow}</Eyebrow>
          <h2 className={styles.title}>{CONSTRUCTION.title}</h2>
        </div>
        <p className={styles.updated}>
          Обновлено <time dateTime={timeline.updatedAt}>{formatDayMonth(timeline.updatedAt)}</time>
        </p>
      </div>

      <ol className={styles.stages}>
        {timeline.stages.map((stage, index) => (
          <li className={styles.stage} data-status={stage.status} key={stage.id}>
            <StageMarker stage={stage} index={index} />
            <div className={styles.stageText}>
              <p className={styles.stageTitle}>{stage.title}</p>
              <p className={styles.stageStatus}>{CONSTRUCTION.status[stage.status]}</p>
            </div>
            {stage.amountKopecks === null ? null : (
              <p className={styles.stageAmount}>{kopecksToRubDisplay(stage.amountKopecks)}</p>
            )}
          </li>
        ))}
      </ol>

      <VideoCard />

      {previews.length === 0 ? null : (
        <ul className={styles.previews}>
          {previews.map((item) => (
            <li className={styles.preview} key={item.id}>
              {item.url === null ? (
                <span className="sr-only">{item.caption}</span>
              ) : (
                <Image
                  className={styles.previewImage}
                  src={item.url}
                  alt={`${item.caption}, ${item.takenAtLabel}`}
                  fill
                  sizes="(min-width: 1024px) 190px, 33vw"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <Link className={styles.galleryLink} href={PAGES.gallery.href}>
        {CONSTRUCTION.galleryLink}
        <ArrowRightIcon />
      </Link>
    </div>
  );
}
