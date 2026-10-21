"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { ShortLinkDialog } from "@/components/admin/short-links/ShortLinkDialog";
import styles from "@/components/admin/short-links/short-links.module.css";
import { Badge, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminShortLink, ShortLinkList } from "@/lib/admin/types";
import { formatCount } from "@/lib/format";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    // Буфер обмена недоступен (http, старый браузер) — адрес виден на экране,
    // его можно выделить руками; сообщаем об этом тостом.
    return false;
  }
}

export default function ShortLinksPage() {
  const { client } = useAdminSession();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAdminQuery<ShortLinkList>(ADMIN_PATHS.shortLinks);
  const [editing, setEditing] = useState<AdminShortLink | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminShortLink | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleCopy(link: AdminShortLink) {
    if (await copyToClipboard(link.shortUrl)) {
      toast.success("Адрес скопирован.");
    } else {
      toast.error("Не удалось скопировать — выделите адрес вручную.");
    }
  }

  async function handleDelete() {
    if (deleting === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await client.request(ADMIN_PATHS.shortLink(deleting.id), { method: "DELETE" });
      toast.success(SAVED_MESSAGE);
      reload();
    } catch (deleteError: unknown) {
      toast.error(errorMessage(deleteError));
    } finally {
      setIsDeleting(false);
      setDeleting(null);
    }
  }

  const items = data?.items ?? null;

  return (
    <AdminPage
      title="Короткие ссылки"
      lead="Ссылки для QR на баннерах и постов в соцсетях. Каждая считает переходы, а пожертвования по ней видны в разделе «Источники»."
      actions={<Button onClick={() => setEditing("new")}>Новая ссылка</Button>}
    >
      {isLoading && data === null ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {items !== null && items.length === 0 ? (
        <EmptyState title="Коротких ссылок пока нет.">
          <p>Нажмите «Новая ссылка», чтобы сделать адрес для QR на баннере или для поста в канале.</p>
        </EmptyState>
      ) : null}
      {items?.map((link) => (
        <Section
          key={link.id}
          title={link.title}
          actions={
            <>
              <Button variant="ghost" isSmall onClick={() => void handleCopy(link)}>
                Копировать адрес
              </Button>
              <Button variant="ghost" isSmall onClick={() => setEditing(link)}>
                Изменить
              </Button>
              {link.clicks === 0 ? (
                <Button variant="ghost" isSmall onClick={() => setDeleting(link)}>
                  Удалить
                </Button>
              ) : null}
            </>
          }
        >
          <p className={styles.meta}>
            {link.isActive ? <Badge tone="success">Работает</Badge> : <Badge>Выключена</Badge>}
            <span>Переходов: {formatCount(link.clicks)}</span>
          </p>
          <p className={styles.url}>{link.shortUrl}</p>
          <p className={styles.target}>Ведёт на: {link.targetUrl}</p>
        </Section>
      ))}

      <ShortLinkDialog
        link={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Удалить ссылку?"
        description={<p>По ней ещё никто не переходил, поэтому её можно удалить. Адрес освободится.</p>}
        confirmLabel="Удалить"
        isDanger
        isBusy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </AdminPage>
  );
}
