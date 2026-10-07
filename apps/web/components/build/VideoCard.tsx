"use client";

import Image from "next/image";
import { useState } from "react";

import { PlayIcon } from "@/components/icons/Icons";
import { CONSTRUCTION, CONSTRUCTION_VIDEO } from "@/lib/content";

import styles from "./VideoCard.module.css";

/**
 * Видео с объекта. До клика — только постер и кнопка play: видеофайл
 * весит мегабайты, и грузить его каждому, кто открыл страницу ради
 * пожертвования в 100 ₽, нельзя. По клику — `<video controls autoPlay>`.
 *
 * Пока видео нет (`src: null`), кнопка не рисуется вовсе — нажимаемая
 * кнопка, которая ничего не делает, хуже её отсутствия.
 */
export function VideoCard() {
  const [isPlaying, setPlaying] = useState(false);
  const { src, posterUrl } = CONSTRUCTION_VIDEO;

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

      <span className={styles.caption}>{CONSTRUCTION.videoCaption}</span>
    </div>
  );
}
