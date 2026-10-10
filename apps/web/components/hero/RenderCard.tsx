import Image from "next/image";

import { StarOrnamentIcon } from "@/components/icons/Icons";
import type { HeroContent } from "@/lib/api/site-content";
import { HERO } from "@/lib/content";

import styles from "./RenderCard.module.css";

interface Props {
  readonly className?: string;
  readonly hero?: Pick<HeroContent, "renderUrl" | "renderCaption">;
}

/**
 * Карточка с рендером мечети. На телефоне у неё арка сверху (макет v2).
 *
 * Пока файла нет — плейсхолдер с линейным орнаментом: подпись остаётся,
 * чтобы было видно, что здесь будет. `preload` — единственный на странице:
 * это самая крупная картинка первого экрана.
 */
export function RenderCard({ className, hero = HERO }: Props) {
  return (
    <figure className={`${styles.card} ${className ?? ""}`}>
      {hero.renderUrl === null ? (
        <span className={styles.placeholder} aria-hidden="true">
          <StarOrnamentIcon />
        </span>
      ) : (
        <Image
          className={styles.image}
          src={hero.renderUrl}
          alt={hero.renderCaption}
          fill
          preload
          sizes="(min-width: 1024px) 680px, 100vw"
        />
      )}
      <figcaption className={styles.caption}>{hero.renderCaption}</figcaption>
    </figure>
  );
}
