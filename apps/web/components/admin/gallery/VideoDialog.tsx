"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminImage } from "@/components/admin/media/AdminImage";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { CheckboxField, FormErrors, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import type { AdminVideo, VideoBody } from "@/lib/admin/types";

import styles from "./gallery.module.css";
import { VideoEmbed } from "./VideoEmbed";

/** Зеркало `video.dto.ts` бэкенда. */
const VIDEO_URL_MAX = 500;
const VIDEO_TITLE_MAX = 200;

interface SaveArgs {
  readonly id: string | null;
  readonly body: VideoBody;
}

function saveVideo(client: AdminClient, { id, body }: SaveArgs): Promise<AdminVideo> {
  return id === null
    ? client.request<AdminVideo>(ADMIN_PATHS.videos, { method: "POST", body })
    : client.request<AdminVideo>(ADMIN_PATHS.video(id), { method: "PATCH", body });
}

/** Похоже на ссылку https — остальное (домен, формат) проверит сервер и объяснит. */
function urlError(url: string): string | null {
  const trimmed = url.trim();

  if (trimmed === "") {
    return "Вставьте ссылку на ролик.";
  }

  return /^https:\/\/\S+$/i.test(trimmed) ? null : "Ссылка должна начинаться с https://";
}

export function AcceptedLinksNote() {
  return (
    <Note>
      <p>Принимаются ссылки только с https:</p>
      <p>
        <b>YouTube</b> — youtube.com/watch?v=…, youtu.be/…, /shorts/…; <b>Rutube</b> — rutube.ru/video/…;{" "}
        <b>VK Видео</b> — vk.com/video-…, vkvideo.ru/video-…. Для закрытого ролика VK вставьте ссылку из кода
        встраивания — в ней есть <code>hash=</code>.
      </p>
    </Note>
  );
}

interface Props {
  readonly video: AdminVideo | "new" | null;
  readonly onClose: () => void;
  readonly onSaved: (video: AdminVideo) => void;
}

export function VideoDialog({ video, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={video !== null} title={video === "new" ? "Добавить видео" : "Видео"} onClose={onClose}>
      {video === null ? null : <VideoForm video={video} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

interface Poster {
  readonly id: string;
  readonly url: string;
}

function VideoForm({ video, onClose, onSaved }: { readonly video: AdminVideo | "new" } & Omit<Props, "video">) {
  const toast = useToast();
  const isNew = video === "new";
  const [url, setUrl] = useState(isNew ? "" : video.sourceUrl);
  const [title, setTitle] = useState(isNew ? "" : (video.title ?? ""));
  const [poster, setPoster] = useState<Poster | null>(
    isNew || video.posterMediaId === null ? null : { id: video.posterMediaId, url: video.poster?.urls.sm ?? "" },
  );
  const [isPublished, setIsPublished] = useState(isNew ? true : video.isPublished);
  const [isPicking, setIsPicking] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(saveVideo);
  const error = isTouched ? urlError(url) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (urlError(url) !== null) {
      return;
    }

    const isUrlChanged = isNew || url.trim() !== video.sourceUrl;
    const body: VideoBody = {
      ...(isUrlChanged ? { url: url.trim() } : {}),
      title: title.trim() === "" ? null : title.trim(),
      posterMediaId: poster?.id ?? null,
      isPublished,
    };
    const saved = await mutation.run({ id: isNew ? null : video.id, body });

    if (saved !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved(saved);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      {isNew ? <AcceptedLinksNote /> : <VideoEmbed embedUrl={video.embedUrl} title={video.title ?? "Видео со стройки"} />}
      <TextField
        label="Ссылка на ролик"
        type="url"
        inputMode="url"
        value={url}
        maxLength={VIDEO_URL_MAX}
        onChange={(event) => setUrl(event.target.value)}
        error={error}
        data-autofocus
      />
      <TextField
        label="Название (необязательно)"
        value={title}
        maxLength={VIDEO_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className={styles.form}>
        {poster ? <AdminImage src={poster.url} alt="" className={styles.preview} /> : null}
        <div>
          <Button variant="ghost" isSmall onClick={() => setIsPicking(true)}>
            {poster ? "Заменить постер" : "Выбрать постер из медиатеки"}
          </Button>{" "}
          {poster ? (
            <Button variant="ghost" isSmall onClick={() => setPoster(null)}>
              Убрать постер
            </Button>
          ) : null}
        </div>
      </div>
      <CheckboxField label="Показывать на сайте" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </Button>
      </FormActions>
      <MediaPicker
        isOpen={isPicking}
        title="Постер видео"
        onClose={() => setIsPicking(false)}
        onSelect={([asset]) => {
          setPoster({ id: asset.id, url: asset.urls.sm });
          setIsPicking(false);
        }}
      />
    </form>
  );
}
