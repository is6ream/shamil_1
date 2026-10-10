"use client";

import Image from "next/image";
import { useState } from "react";

import { PlayIcon } from "@/components/icons/Icons";
import type { PublicVideo } from "@/lib/api/site-content";
import { CONSTRUCTION, CONSTRUCTION_VIDEO } from "@/lib/content";

import styles from "./VideoCard.module.css";

/**
 * Видео с объекта. До клика — только постер и кнопка play: видеофайл
 * весит мегабайты, и грузить его каждому, кто открыл страницу ради
 * пожертвования в 100 ₽, нельзя. По клику — `<video controls autoPlay>`.
 *
 * Пока видео нет (`src: null`), кнопка не рисуется вовсе — нажимаемая
 * кнопка, которая ничего не делает, хуже её отсутствия.
 *
 * Видео из админки (D-13) — ссылка на YouTube/Rutube/VK: по клику вместо
 * `<video>` встаёт iframe плеера в песочнице. Плеер чужого сайта тоже
 * не грузится до клика.
 */
export function VideoCard({ video = null }: { readonly video?: PublicVideo | null }) {
  const [isPlaying, setPlaying] = useState(false);
  const src = video === null ? CONSTRUCTION_VIDEO.src : video.embedUrl;
  const posterUrl = video === null ? CONSTRUCTION_VIDEO.posterUrl : (video.poster?.urls.md ?? null);
  const caption = video?.title ?? CONSTRUCTION.videoCaption;

  if (isPlaying && video !== null) {
    return (
      <div className={styles.card}>
        <iframe
          className={styles.video}
          src={`${video.embedUrl}${video.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title={caption}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; fullscreen; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (isPlaying && src !== null) {
    return (
      <div className={styles.card}>
        <video
          className={styles.video}
          src={src}
          poster={posterUrl ?? undefined}
          controls
          autoPlay
          playsInline
        />
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {posterUrl === null ? null : (
        <Image
          className={styles.poster}
          src={posterUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 585px, 100vw"
        />
      )}

      {src === null ? (
        <span className={styles.play} aria-hidden="true">
          <PlayIcon />
        </span>
      ) : (
        <button
          className={styles.play}
          type="button"
          aria-label={CONSTRUCTION.videoPlayLabel}
          onClick={() => {
            setPlaying(true);
          }}
        >
          <PlayIcon />
        </button>
      )}

      <span className={styles.caption}>{caption}</span>
    </div>
  );
}
