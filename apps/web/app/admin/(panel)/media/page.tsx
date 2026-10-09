"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminImage } from "@/components/admin/media/AdminImage";
import styles from "@/components/admin/media/media.module.css";
import { MediaGrid } from "@/components/admin/media/MediaGrid";
import { AltTextForm, MediaUploader } from "@/components/admin/media/MediaUploader";
import { Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { Pagination } from "@/components/admin/ui/DataTable";
import { ConfirmDialog, Modal } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { USAGE_TYPE_HREFS, USAGE_TYPE_LABELS } from "@/lib/admin/labels";
import { formatBytes, usagesFromError } from "@/lib/admin/media";
import { withQuery } from "@/lib/admin/query";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { MediaAsset, MediaUsage, Paged } from "@/lib/admin/types";

const MEDIA_PAGE_SIZE = 24;

function UsagesList({ usages }: { readonly usages: readonly MediaUsage[] }) {
  return (
    <ul className={styles.usages}>
      {usages.map((usage) => (
        <li key={`${usage.entityType}:${usage.entityId}`}>
          <Link href={USAGE_TYPE_HREFS[usage.entityType]}>{USAGE_TYPE_LABELS[usage.entityType]}</Link>: {usage.label}
        </li>
      ))}
    </ul>
  );
}

export default function MediaPage() {
  const { client } = useAdminSession();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blocked, setBlocked] = useState<{ asset: MediaAsset; usages: readonly MediaUsage[] } | null>(null);
  const path = withQuery(ADMIN_PATHS.media, { page, pageSize: MEDIA_PAGE_SIZE });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<MediaAsset>>(path);

  function refreshFirstPage() {
    if (page === 1) {
      reload();
    } else {
      setPage(1);
    }
  }

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    const asset = deleting;

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.mediaItem(asset.id), { method: "DELETE" });
      toast.success("Фото удалено.");
      reload();
    } catch (deleteError: unknown) {
      const usages = usagesFromError(deleteError);

      if (usages.length > 0) {
        setBlocked({ asset, usages });
      } else {
        toast.error(errorMessage(deleteError));
      }
    } finally {
      setIsDeleting(false);
      setDeleting(null);
    }
  }

  return (
    <AdminPage
      title="Фото"
      lead="Все картинки сайта — отсюда: галерея, ход стройки, новости, первый экран. Сервер сам уменьшает фото и убирает из них геометку."
      isWide
    >
      <Section>
        <MediaUploader onUploaded={refreshFirstPage} onAssetChanged={refreshFirstPage} />
      </Section>

      <Section title="Медиатека">
        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {data !== null && data.items.length === 0 ? (
          <EmptyState title="Фото пока нет.">
            <p>Загрузите первые снимки стройки кнопкой выше — с телефона можно сразу с камеры.</p>
          </EmptyState>
        ) : null}
        {data !== null && data.items.length > 0 ? (
          <>
            <MediaGrid
              items={data.items}
              renderActions={(asset) => (
                <>
                  <Button variant="ghost" isSmall onClick={() => setEditing(asset)}>
                    Описание
                  </Button>
                  <Button variant="ghost" isSmall onClick={() => setDeleting(asset)}>
                    Удалить
                  </Button>
                </>
              )}
            />
            <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
          </>
        ) : null}
      </Section>

      <Modal isOpen={editing !== null} title="Описание фото" onClose={() => setEditing(null)} isDismissible>
        {editing ? (
          <>
            <AdminImage src={editing.urls.md} alt={editing.altText ?? ""} width={editing.width} height={editing.height} className={styles.thumb} />
            <p className={styles.pickerNote}>
              {editing.originalName ?? "Без имени"} · {editing.width}×{editing.height} · {formatBytes(editing.bytes)} ·
              загружено {formatDateTime(editing.createdAt)}
            </p>
            <AltTextForm
              asset={editing}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
            />
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Удалить фото?"
        description={<p>Файл исчезнет из медиатеки. Если фото стоит на сайте, сервер не даст удалить и покажет где.</p>}
        confirmLabel="Удалить"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />

      <Modal isOpen={blocked !== null} title="Фото используется" onClose={() => setBlocked(null)} isDismissible>
        {blocked ? (
          <>
            <p>Сначала уберите его из этих мест, потом удалите:</p>
            <UsagesList usages={blocked.usages} />
          </>
        ) : null}
      </Modal>
    </AdminPage>
  );
}
