"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminImage } from "@/components/admin/media/AdminImage";
import { FormActions } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { CheckboxField, FormErrors, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import { isPlainDate } from "@/lib/admin/time";
import type { AdminGalleryItem, GalleryItemBody } from "@/lib/admin/types";

import styles from "./gallery.module.css";

/** Зеркало `gallery.dto.ts` бэкенда (в API.md лимитов нет). */
export const GALLERY_CAPTION_MAX = 300;
export const GALLERY_ALT_MAX = 200;

const monthYear = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });

/** «2026-06-14» → «июнь 2026 г.» без пересчёта поясов — как подпись на сайте. */
export function takenOnLabel(takenOn: string | null): string | null {
  return takenOn === null ? null : monthYear.format(new Date(`${takenOn}T00:00:00Z`)).replace(" г.", "");
}

interface SaveArgs {
  readonly id: string;
  readonly body: GalleryItemBody;
}

function saveItem(client: AdminClient, { id, body }: SaveArgs): Promise<AdminGalleryItem> {
  return client.request<AdminGalleryItem>(ADMIN_PATHS.galleryItem(id), { method: "PATCH", body });
}

interface Props {
  readonly item: AdminGalleryItem | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function GalleryItemDialog({ item, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={item !== null} title="Фото в галерее" onClose={onClose}>
      {item ? <ItemForm item={item} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function ItemForm({ item, onClose, onSaved }: { readonly item: AdminGalleryItem } & Omit<Props, "item">) {
  const toast = useToast();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [alt, setAlt] = useState(item.altText ?? "");
  const [takenOn, setTakenOn] = useState(item.takenOn ?? "");
  const [isPublished, setIsPublished] = useState(item.isPublished);
  const mutation = useAdminMutation(saveItem);
  const dateError = takenOn !== "" && !isPlainDate(takenOn) ? "Дата в формате ДД.ММ.ГГГГ" : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (dateError !== null) {
      return;
    }

    const body: GalleryItemBody = {
      caption: caption.trim() === "" ? null : caption.trim(),
      altText: alt.trim() === "" ? null : alt.trim(),
      takenOn: takenOn === "" ? null : takenOn,
      isPublished,
    };

    if ((await mutation.run({ id: item.id, body })) !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <AdminImage src={item.image?.urls.md ?? item.url} alt="" className={styles.preview} />
      <TextField
        label="Подпись на сайте"
        value={caption}
        maxLength={GALLERY_CAPTION_MAX}
        onChange={(event) => setCaption(event.target.value)}
        hint="Например: «Заливка фундамента»."
        data-autofocus
      />
      <TextField
        label="Описание для незрячих (alt)"
        value={alt}
        maxLength={GALLERY_ALT_MAX}
        onChange={(event) => setAlt(event.target.value)}
        hint="Пусто — возьмётся описание из медиатеки."
      />
      <TextField
        label="Дата съёмки"
        type="date"
        value={takenOn}
        onChange={(event) => setTakenOn(event.target.value)}
        error={dateError}
        hint={takenOn === "" ? "На сайте показываются месяц и год." : `На сайте: «${takenOnLabel(takenOn)}».`}
      />
      <CheckboxField
        label="Показывать на сайте"
        checked={isPublished}
        onChange={(event) => setIsPublished(event.target.checked)}
      />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}
