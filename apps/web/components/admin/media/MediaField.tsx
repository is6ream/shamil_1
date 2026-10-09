"use client";

import { useState } from "react";

import { Button } from "@/components/admin/ui/Button";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { MediaAsset } from "@/lib/admin/types";

import { AdminImage } from "./AdminImage";
import styles from "./PhotoListEditor.module.css";
import { MediaPicker } from "./MediaPicker";

interface Props {
  readonly label: string;
  readonly mediaId: string | null;
  readonly hint?: string;
  readonly onChange: (mediaId: string | null) => void;
}

/**
 * Одна картинка из медиатеки по id (рендер, фасад, QR, обложка). Превью
 * подтягивается по id: в блоках контента хранится только он.
 */
export function MediaField({ label, mediaId, hint, onChange }: Props) {
  const [isPicking, setIsPicking] = useState(false);
  const [picked, setPicked] = useState<MediaAsset | null>(null);
  const known = picked !== null && picked.id === mediaId ? picked : null;
  const { data, error } = useAdminQuery<MediaAsset>(mediaId !== null && known === null ? ADMIN_PATHS.mediaItem(mediaId) : null);
  const asset = known ?? data;

  return (
    <div className={styles.editor}>
      <p className={styles.label}>{label}</p>
      {mediaId === null ? <p className={styles.empty}>Не выбрано{hint ? ` — ${hint}` : ""}.</p> : null}
      {asset ? <AdminImage src={asset.urls.sm} alt={asset.altText ?? ""} width={160} height={120} className={styles.thumb} /> : null}
      {error ? <p className={styles.error}>Не удалось показать превью: {error}</p> : null}
      <div className={styles.fieldActions}>
        <Button variant="ghost" isSmall onClick={() => setIsPicking(true)}>
          {mediaId === null ? "Выбрать из медиатеки" : "Заменить"}
        </Button>
        {mediaId !== null ? (
          <Button variant="ghost" isSmall onClick={() => onChange(null)}>
            Убрать
          </Button>
        ) : null}
      </div>
      <MediaPicker
        isOpen={isPicking}
        title={label}
        onClose={() => setIsPicking(false)}
        onSelect={([selected]) => {
          setPicked(selected);
          onChange(selected.id);
          setIsPicking(false);
        }}
      />
    </div>
  );
}
