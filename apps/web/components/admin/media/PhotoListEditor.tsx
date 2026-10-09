"use client";

import { useState } from "react";

import { Button } from "@/components/admin/ui/Button";
import { ReorderButtons } from "@/components/admin/ui/ReorderButtons";
import { moveItem } from "@/lib/admin/reorder";
import type { StagePhoto } from "@/lib/admin/stages";

import { AdminImage } from "./AdminImage";
import styles from "./PhotoListEditor.module.css";
import { MediaPicker } from "./MediaPicker";

interface Props {
  readonly photos: readonly StagePhoto[];
  readonly max: number;
  readonly error?: string | null;
  readonly onChange: (photos: readonly StagePhoto[]) => void;
}

/** Фото записи из медиатеки: добавить, переставить, убрать. Порядок = порядок на сайте. */
export function PhotoListEditor({ photos, max, error, onChange }: Props) {
  const [isPicking, setIsPicking] = useState(false);
  const left = max - photos.length;

  return (
    <div className={styles.editor}>
      <p className={styles.label}>
        Фото ({photos.length} из {max})
      </p>
      {photos.length === 0 ? <p className={styles.empty}>Фото не выбраны.</p> : null}
      <ol className={styles.list}>
        {photos.map((photo, index) => (
          <li key={photo.id} className={styles.item}>
            <AdminImage src={photo.url} alt="" width={96} height={72} className={styles.thumb} />
            <span className={styles.position}>{index + 1}</span>
            <div className={styles.actions}>
              <ReorderButtons
                label={`фото ${index + 1}`}
                index={index}
                count={photos.length}
                onMove={(from, delta) => onChange(moveItem(photos, from, delta))}
              />
              <Button
                variant="ghost"
                isSmall
                aria-label={`Убрать фото ${index + 1}`}
                onClick={() => onChange(photos.filter((item) => item.id !== photo.id))}
              >
                Убрать
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {error ? <p className={styles.error}>{error}</p> : null}
      <Button variant="ghost" isSmall disabled={left <= 0} onClick={() => setIsPicking(true)}>
        Добавить фото из медиатеки
      </Button>
      <MediaPicker
        isOpen={isPicking}
        isMultiple
        maxCount={left}
        onClose={() => setIsPicking(false)}
        onSelect={(assets) => {
          const known = new Set(photos.map((photo) => photo.id));
          const added = assets.filter((asset) => !known.has(asset.id)).map((asset) => ({ id: asset.id, url: asset.urls.sm }));

          onChange([...photos, ...added].slice(0, max));
          setIsPicking(false);
        }}
      />
    </div>
  );
}
