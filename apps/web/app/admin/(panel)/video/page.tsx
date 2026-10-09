"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import styles from "@/components/admin/gallery/gallery.module.css";
import { AcceptedLinksNote, VideoDialog } from "@/components/admin/gallery/VideoDialog";
import { VideoEmbed } from "@/components/admin/gallery/VideoEmbed";
import { Badge, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { ReorderButtons } from "@/components/admin/ui/ReorderButtons";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminVideo, VideoProvider } from "@/lib/admin/types";
import { useReorder } from "@/lib/admin/use-reorder";

const PROVIDER_LABELS: Readonly<Record<VideoProvider, string>> = { youtube: "YouTube", rutube: "Rutube", vk: "VK Видео" };

export default function VideoPage() {
  const { client } = useAdminSession();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAdminQuery<readonly AdminVideo[]>(ADMIN_PATHS.videos);
  const { list, move, isSaving } = useReorder(data, ADMIN_PATHS.videosOrder);
  const [editing, setEditing] = useState<AdminVideo | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminVideo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.video(deleting.id), { method: "DELETE" });
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
      title="Видео"
      lead="Ролики со стройки. Видео не загружаются на сайт — только ссылки на YouTube, Rutube или VK Видео."
      actions={<Button onClick={() => setEditing("new")}>Добавить видео</Button>}
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {list !== null && list.length === 0 ? (
        <>
          <EmptyState title="Видео пока нет — на сайте стоит заглушка «Видео с объекта».">
            <p>Нажмите «Добавить видео» и вставьте ссылку на ролик.</p>
          </EmptyState>
          <AcceptedLinksNote />
        </>
      ) : null}
      {list?.map((video, index) => (
        <Section
          key={video.id}
          title={video.title ?? `Видео ${index + 1}`}
          actions={
            <>
              <ReorderButtons
                label={video.title ?? `видео ${index + 1}`}
                index={index}
                count={list.length}
                isDisabled={isSaving}
                onMove={move}
              />
              <Button variant="ghost" isSmall onClick={() => setEditing(video)}>
                Изменить
              </Button>
              <Button variant="ghost" isSmall onClick={() => setDeleting(video)}>
                Удалить
              </Button>
            </>
          }
        >
          <p className={styles.meta}>
            {video.isPublished ? <Badge tone="success">На сайте</Badge> : <Badge>Скрыто</Badge>}
            <span>{PROVIDER_LABELS[video.provider]}</span>
          </p>
          <VideoEmbed embedUrl={video.embedUrl} title={video.title ?? "Видео со стройки"} />
          <p className={styles.source}>{video.sourceUrl}</p>
        </Section>
      ))}

      <VideoDialog
        video={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Удалить видео?"
        description={<p>Ссылка на ролик исчезнет с сайта. Сам ролик на YouTube, Rutube или VK не удалится.</p>}
        confirmLabel="Удалить"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminPage>
  );
}
