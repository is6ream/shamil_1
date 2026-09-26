import Image from "next/image";

import { StarOrnamentIcon } from "@/components/icons/Icons";
import { HERO } from "@/lib/content";

import styles from "./RenderCard.module.css";

interface Props {
  readonly className?: string;
}

/**
 * Карточка с рендером мечети. На телефоне у неё арка сверху (макет v2).
 *
 * Пока файла нет — плейсхолдер с линейным орнаментом: подпись остаётся,
 * чтобы было видно, что здесь будет. `preload` — единственный на странице:
 * это самая крупная картинка первого экрана.
 */
export function RenderCard({ className }: Props) {
  return (
    <figure className={`${styles.card} ${className ?? ""}`}>
      {HERO.renderUrl === null ? (
        <span className={styles.placeholder} aria-hidden="true">
          <StarOrnamentIcon />
        </span>
      ) : (
        <Image
          className={styles.image}
          src={HERO.renderUrl}
          alt={HERO.renderCaption}
          fill
          preload
          sizes="(min-width: 1024px) 680px, 100vw"
        />
      )}
      <figcaption className={styles.caption}>{HERO.renderCaption}</figcaption>
    </figure>
  );
}
