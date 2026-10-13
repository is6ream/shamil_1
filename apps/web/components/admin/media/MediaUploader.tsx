"use client";

import { useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";

import { Button } from "@/components/admin/ui/Button";
import { TextField } from "@/components/admin/ui/Field";
import { useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import { ACCEPT_ATTRIBUTE } from "@/lib/admin/media";
import type { MediaAsset } from "@/lib/admin/types";

import { AdminImage } from "./AdminImage";
import styles from "./media.module.css";
import { useUploadQueue } from "./use-upload-queue";
import type { UploadItem } from "./use-upload-queue";

export const ALT_MAX = 300;

interface AltArgs {
  readonly id: string;
  readonly altText: string | null;
}

function saveAlt(client: AdminClient, { id, altText }: AltArgs): Promise<MediaAsset> {
  return client.request<MediaAsset>(ADMIN_PATHS.mediaItem(id), { method: "PATCH", body: { altText } });
}

/** Подпись для незрячих и поисковиков: `PATCH /admin/media/:id`. Пусто — `null`. */
export function AltTextForm({ asset, onSaved }: { readonly asset: MediaAsset; readonly onSaved: (asset: MediaAsset) => void }) {
  const toast = useToast();
  const [value, setValue] = useState(asset.altText ?? "");
  const mutation = useAdminMutation(saveAlt);
  const trimmed = value.trim();
  const isChanged = trimmed !== (asset.altText ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const saved = await mutation.run({ id: asset.id, altText: trimmed === "" ? null : trimmed });

    if (saved !== undefined) {
      toast.success("Описание сохранено.");
      onSaved(saved);
    }
  }

  return (
    <form className={styles.altForm} onSubmit={handleSubmit}>
      <TextField
        label="Что на фото"
        value={value}
        maxLength={ALT_MAX}
        onChange={(event) => setValue(event.target.value)}
        error={mutation.error}
        hint="Например: «Заливка фундамента, вид с северной стороны». Читают незрячие и поисковики."
      />
      <Button type="submit" variant="ghost" isSmall isBusy={mutation.isPending} disabled={!isChanged}>
        Сохранить описание
      </Button>
    </form>
  );
}

const STATUS_TEXT = { queued: "В очереди", uploading: "Загружается", done: "Загружено", error: "Ошибка" } as const;

function QueueRow({
  item,
  onDismiss,
  onAltSaved,
}: {
  readonly item: UploadItem;
  readonly onDismiss: (key: number) => void;
  readonly onAltSaved: (asset: MediaAsset) => void;
}) {
  return (
    <li className={`${styles.queueRow} ${item.status === "error" ? styles.queueError : ""}`}>
      <div className={styles.queueHead}>
        {item.asset ? (
          <AdminImage src={item.asset.urls.sm} alt="" width={64} height={48} className={styles.queueThumb} />
        ) : null}
        <span className={styles.queueName}>{item.name}</span>
        <span className={styles.queueStatus}>
          {item.status === "uploading" ? `${Math.round(item.progress * 100)}%` : STATUS_TEXT[item.status]}
        </span>
        {item.status === "done" || item.status === "error" ? (
          <button type="button" className={styles.dismiss} aria-label={`Убрать «${item.name}» из списка`} onClick={() => onDismiss(item.key)}>
            ×
          </button>
        ) : null}
      </div>
      {item.status === "uploading" || item.status === "queued" ? (
        <progress className={styles.progress} max={1} value={item.progress} aria-label={`Загрузка ${item.name}`} />
      ) : null}
      {item.error ? <p className={styles.queueMessage}>{item.error}</p> : null}
      {item.asset ? <AltTextForm asset={item.asset} onSaved={onAltSaved} /> : null}
    </li>
  );
}

interface Props {
  readonly onUploaded: (asset: MediaAsset) => void;
  /** Описание после загрузки обновило файл — например, перерисовать сетку. */
  readonly onAssetChanged?: (asset: MediaAsset) => void;
}

/**
 * Кнопка и зона перетаскивания. `accept` на телефоне открывает камеру
 * и галерею; несколько файлов уходят очередью по одному.
 */
export function MediaUploader({ onUploaded, onAssetChanged }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const queue = useUploadQueue(onUploaded);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    queue.add(Array.from(event.dataTransfer.files));
  }

  function handleAltSaved(asset: MediaAsset) {
    queue.updateAsset(asset);
    onAssetChanged?.(asset);
  }

  return (
    <div>
      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <Button onClick={() => input.current?.click()}>Загрузить фото</Button>
        <p>или перетащите файлы сюда. JPEG, PNG или WebP до 15 МБ.</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          hidden
          onChange={(event) => {
            queue.add(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      {queue.items.length > 0 ? (
        <ul className={styles.queue} aria-live="polite">
          {queue.items.map((item) => (
            <QueueRow key={item.key} item={item} onDismiss={queue.dismiss} onAltSaved={handleAltSaved} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
