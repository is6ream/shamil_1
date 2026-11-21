import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons/Icons";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { PublicVideo } from "@/lib/api/site-content";
import type { ConstructionTimeline as Timeline, GalleryItem } from "@/lib/api/types";
import { CONSTRUCTION, PAGES } from "@/lib/content";
import { formatDayMonth } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";

import { ConstructionSketch } from "./ConstructionSketch";
import styles from "./ConstructionTimeline.module.css";
import { VideoCard } from "./VideoCard";

interface Props {
  readonly timeline: Timeline;
  readonly gallery: readonly GalleryItem[];
  readonly video?: PublicVideo | null;
}

const APPROVED_PHOTOS = [1, 2, 3].map((number) => ({
  id: `construction-photo-${number}`,
  url: `/landing/construction-${number}.webp`,
  alt: `Фото со стройки мечети «Шамиль», кадр ${number}`,
}));

export function ConstructionTimeline({ timeline, gallery, video = null }: Props) {
  const publishedPhotos = gallery.flatMap((item) => {
    const url = item.thumbUrl ?? item.url;
    return url === null ? [] : [{ id: item.id, url, alt: item.alt ?? item.caption }];
  });
  const previews = (publishedPhotos.length > 0 ? publishedPhotos : APPROVED_PHOTOS).slice(0, 3);

  return (
    <>
      <Eyebrow>{CONSTRUCTION.eyebrow}</Eyebrow>
      <h2 className={styles.title}>{CONSTRUCTION.title}</h2>
      <p className={styles.lede}>Выберите этап и посмотрите, как меняется облик будущей мечети.</p>
      <ConstructionSketch />

      <div className={styles.gallery}>
        <h3>Фото со стройки</h3>
        <ul className={styles.previews}>
          {previews.map((item) => (
            <li className={styles.preview} key={item.id}>
              <Image src={item.url} alt={item.alt} fill sizes="(max-width: 730px) 33vw, 420px" />
            </li>
          ))}
        </ul>
        <Link className={styles.galleryLink} href={PAGES.gallery.href}>
          {CONSTRUCTION.galleryLink} <ArrowRightIcon />
        </Link>
      </div>

      <details className={styles.progress}>
        <summary>Текущий статус работ</summary>
        <p>Обновлено <time dateTime={timeline.updatedAt}>{formatDayMonth(timeline.updatedAt)}</time></p>
        <ul>
          {timeline.stages.map((stage) => (
            <li key={stage.id}>
              <strong>{stage.title}</strong>
              <span>{CONSTRUCTION.status[stage.status]}</span>
              {stage.amountKopecks === null ? null : <span>{kopecksToRubDisplay(stage.amountKopecks)}</span>}
            </li>
          ))}
        </ul>
      </details>

      {video === null ? null : <div className={styles.video}><VideoCard video={video} /></div>}
    </>
  );
}
