import type { Metadata } from "next";
import Image from "next/image";

import { SimplePage } from "@/components/layout/SimplePage";
import { GALLERY_PLACEHOLDERS, getGallery } from "@/lib/api/showcase";
import { withFallback } from "@/lib/api/with-fallback";
import { GALLERY_PAGE, PAGES } from "@/lib/content";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: PAGES.gallery.title,
};

/**
 * Фото и видео со стройки в хронологическом порядке — с самых первых
 * этапов (требование ТЗ). Пока снимков нет, стоят плашки с подписью
 * и датой: пустая сетка читается как сломанная страница.
 */
/** Снимки добавляются редко — страница перегенерируется раз в час. */
export const revalidate = 3600;

export default async function GalleryPage() {
  const gallery = await withFallback(getGallery(), GALLERY_PLACEHOLDERS, "галерея");

  return (
    <SimplePage title={PAGES.gallery.title} lede={GALLERY_PAGE.lede}>
      <ul className={styles.grid}>
        {gallery.map((item) => (
          <li key={item.id}>
            <figure className={styles.item}>
              <div className={styles.frame}>
                {item.url === null ? null : (
                  <Image
                    className={styles.image}
                    src={item.thumbUrl ?? item.url}
                    alt={item.alt ?? item.caption}
                    fill
                    sizes="(min-width: 768px) 280px, 50vw"
                  />
                )}
              </div>
              <figcaption className={styles.caption}>
                {item.caption}
                <span>{item.takenAtLabel}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </SimplePage>
  );
}
