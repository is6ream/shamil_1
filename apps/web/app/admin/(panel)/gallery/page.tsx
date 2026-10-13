"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import styles from "@/components/admin/gallery/gallery.module.css";
import { GalleryItemDialog, takenOnLabel } from "@/components/admin/gallery/GalleryItemDialog";
import { AdminImage } from "@/components/admin/media/AdminImage";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { Badge } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { ReorderButtons } from "@/components/admin/ui/ReorderButtons";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminGalleryItem, MediaAsset } from "@/lib/admin/types";
import { useReorder } from "@/lib/admin/use-reorder";

export default function GalleryPage() {
  const { client } = useAdminSession();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAdminQuery<readonly AdminGalleryItem[]>(ADMIN_PATHS.gallery);
  const { list, move, isSaving } = useReorder(data, ADMIN_PATHS.galleryOrder);
  const [isPicking, setIsPicking] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<AdminGalleryItem | null>(null);
  const [deleting, setDeleting] = useState<AdminGalleryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /** По одному POST на фото, по порядку выбора: так и встанут в конец галереи. */
  async function handleAdd(assets: readonly MediaAsset[]) {
    setIsPicking(false);
    setIsAdding(true);

    let added = 0;

    try {
      for (const asset of assets) {
        await client.request(ADMIN_PATHS.gallery, { method: "POST", body: { mediaAssetId: asset.id } });
        added += 1;
      }

      toast.success(`Добавлено фото: ${added}. ${SAVED_MESSAGE}`);
    } catch (addError: unknown) {
      toast.error(`Добавлено ${added} из ${assets.length}. ${errorMessage(addError)}`);
    } finally {
      setIsAdding(false);
      reload();
    }
  }

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.galleryItem(deleting.id), { method: "DELETE" });
      toast.success(SAVED_MESSAGE);
      reload();
    } catch (deleteError: unknown) {
      toast.error(errorMessage(deleteError));
    } finally {
      setIsDeleting(false);
      setDeleting(null);
    }
  }

  return (
    <AdminPage
      title="Галерея"
      lead="Фото на странице «Фото и видео со стройки» — в этом порядке, от первых этапов."
      actions={
        <Button isBusy={isAdding} onClick={() => setIsPicking(true)}>
          Добавить из медиатеки
        </Button>
      }
      isWide
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {list !== null && list.length === 0 ? (
        <EmptyState title="В галерее пока нет фото — на сайте стоят плашки-заглушки.">
          <p>Загрузите снимки в «Фото» и добавьте их сюда кнопкой «Добавить из медиатеки».</p>
        </EmptyState>
      ) : null}
      {list !== null && list.length > 0 ? (
        <ol className={styles.list}>
          {list.map((item, index) => {
            const label = item.caption ?? `Фото ${index + 1}`;

            return (
              <li key={item.id} className={`${styles.item} ${item.isPublished ? "" : styles.hidden}`}>
                <AdminImage src={item.image?.urls.sm ?? item.url} alt={item.altText ?? ""} className={styles.thumb} />
                <div className={styles.body}>
                  <p className={styles.caption}>{item.caption ?? <i>Без подписи</i>}</p>
                  <p className={styles.meta}>
                    {item.isPublished ? <Badge tone="success">На сайте</Badge> : <Badge>Скрыто</Badge>}
                    {item.takenOn ? <span>{takenOnLabel(item.takenOn)}</span> : null}
                  </p>
                </div>
                <div className={styles.actions}>
                  <ReorderButtons label={label} index={index} count={list.length} isDisabled={isSaving} onMove={move} />
                  <Button variant="ghost" isSmall onClick={() => setEditing(item)}>
                    Изменить
                  </Button>
                  <Button variant="ghost" isSmall onClick={() => setDeleting(item)}>
                    Убрать
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <MediaPicker
        isOpen={isPicking}
        title="Добавить в галерею"
        isMultiple
        onClose={() => setIsPicking(false)}
        onSelect={handleAdd}
      />
      <GalleryItemDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Убрать фото из галереи?"
        description={<p>Фото исчезнет с сайта, но останется в медиатеке — его можно вернуть.</p>}
        confirmLabel="Убрать"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminPage>
  );
}
