import type { Metadata } from "next";
import Image from "next/image";

import { SimplePage } from "@/components/layout/SimplePage";
import { getGallery } from "@/lib/api/showcase";
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
export default async function GalleryPage() {
  const gallery = await getGallery();

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
                    src={item.url}
                    alt={item.caption}
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
