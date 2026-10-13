"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { MediaField } from "@/components/admin/media/MediaField";
import { Badge, FormActions, Section } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextAreaField, TextField } from "@/components/admin/ui/Field";
import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import { Markdown } from "@/components/content/Markdown";
import styles from "@/app/admin/(panel)/news/news.module.css";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminMutation, useUnsavedChangesWarning } from "@/lib/admin/hooks";
import {
  EMPTY_NEWS_FORM,
  NEWS_BODY_MAX,
  NEWS_EXCERPT_MAX,
  NEWS_SLUG_MAX,
  NEWS_TITLE_MAX,
  checkNews,
  newsPublicPath,
  newsToForm,
} from "@/lib/admin/news";
import type { NewsForm } from "@/lib/admin/news";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminNewsPost, NewsBody, NewsStatus } from "@/lib/admin/types";

interface SaveArgs {
  readonly id: string | null;
  readonly body: NewsBody;
}

function saveNews(client: AdminClient, { id, body }: SaveArgs): Promise<AdminNewsPost> {
  return id === null
    ? client.request<AdminNewsPost>(ADMIN_PATHS.news, { method: "POST", body })
    : client.request<AdminNewsPost>(ADMIN_PATHS.newsPost(id), { method: "PATCH", body });
}

function Cheatsheet() {
  return (
    <details className={styles.cheatsheet}>
      <summary>Как оформлять текст</summary>
      <ul>
        <li>
          <code>## Подзаголовок</code>
        </li>
        <li>
          <code>**жирный**</code>, <code>*курсив*</code>
        </li>
        <li>
          <code>- пункт списка</code> или <code>1. пункт</code>
        </li>
        <li>
          <code>[текст ссылки](https://mechetshamil.ru)</code>
        </li>
        <li>
          <code>&gt; цитата</code>
        </li>
        <li>Пустая строка — новый абзац. HTML-теги не принимаются. Фото — в обложку.</li>
      </ul>
    </details>
  );
}

interface Props {
  /** `null` — новая новость. */
  readonly post: AdminNewsPost | null;
  readonly onChanged: (post: AdminNewsPost) => void;
}

export function NewsEditor({ post, onChanged }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { client } = useAdminSession();
  const [saved, setSaved] = useState<NewsForm>(() => (post === null ? EMPTY_NEWS_FORM : newsToForm(post)));
  const [form, setForm] = useState<NewsForm>(saved);
  const [isTouched, setIsTouched] = useState(false);
  const [pane, setPane] = useState<"text" | "preview">("text");
  const [statusChange, setStatusChange] = useState<NewsStatus | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const mutation = useAdminMutation(saveNews);
  const check = checkNews(form);
  const errors = isTouched && !check.ok ? check.errors : {};
  const isDirty = form !== saved;

  useUnsavedChangesWarning(isDirty);

  function set<K extends keyof NewsForm>(key: K, value: NewsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (!check.ok) {
      return;
    }

    const result = await mutation.run({ id: post?.id ?? null, body: check.body });

    if (result === undefined) {
      return;
    }

    const next = newsToForm(result);

    setSaved(next);
    setForm(next);
    setIsTouched(false);
    toast.success(result.status === "published" ? SAVED_MESSAGE : "Черновик сохранён.");

    if (post === null) {
      router.replace(`/admin/news/${result.id}`);
    } else {
      onChanged(result);
    }
  }

  async function changeStatus() {
    if (post === null || statusChange === null) {
      return;
    }

    setIsBusy(true);

    try {
      const result = await client.request<AdminNewsPost>(ADMIN_PATHS.newsPost(post.id), {
        method: "PATCH",
        body: { status: statusChange },
      });

      toast.success(statusChange === "published" ? "Опубликовано. На сайте появится в течение минуты." : "Снято с публикации.");
      onChanged(result);
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    } finally {
      setIsBusy(false);
      setStatusChange(null);
    }
  }

  async function handleDelete() {
    if (post === null) {
      return;
    }

    setIsBusy(true);

    try {
      await client.request(ADMIN_PATHS.newsPost(post.id), { method: "DELETE" });
      toast.success("Новость удалена.");
      setSaved(form);
      router.replace("/admin/news");
    } catch (error: unknown) {
      toast.error(errorMessage(error));
      setIsBusy(false);
      setIsDeleting(false);
    }
  }

  const isSlugTaken = mutation.errors.some((message) => message.includes("slug") && message.includes("уже"));

  return (
    <>
      {post !== null ? (
        <Section>
          <div className={styles.statusLine}>
            {post.status === "published" ? (
              <>
                <Badge tone="success">Опубликовано {formatDateTime(post.publishedAt)}</Badge>
                <a href={newsPublicPath(post.slug)} target="_blank" rel="noreferrer">
                  Открыть на сайте ↗
                </a>
              </>
            ) : (
              <Badge>Черновик — на сайте не виден</Badge>
            )}
          </div>
          <FormActions>
            {post.status === "draft" ? (
              <Button disabled={isDirty} onClick={() => setStatusChange("published")}>
                Опубликовать
              </Button>
            ) : (
              <Button variant="ghost" disabled={isDirty} onClick={() => setStatusChange("draft")}>
                Снять с публикации
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsDeleting(true)}>
              Удалить
            </Button>
          </FormActions>
          {isDirty ? <p className={styles.previewLabel}>Сначала сохраните изменения</p> : null}
        </Section>
      ) : null}

      <Section>
        <form className={styles.editor} onSubmit={handleSubmit} noValidate>
          <TextField
            label="Заголовок"
            value={form.title}
            maxLength={NEWS_TITLE_MAX}
            onChange={(event) => set("title", event.target.value)}
            error={errors.title}
            data-autofocus
          />
          <TextField
            label="Адрес страницы (необязательно)"
            value={form.slug}
            maxLength={NEWS_SLUG_MAX}
            onChange={(event) => set("slug", event.target.value)}
            error={errors.slug ?? (isSlugTaken ? "Этот адрес уже занят другой новостью — придумайте другой." : null)}
            hint={`Пусто — сделаем из заголовка: «Залили фундамент» → zalili-fundament. Страница: /novosti/${form.slug.trim() || "…"}`}
          />
          <TextAreaField
            label="Анонс"
            value={form.excerpt}
            maxLength={NEWS_EXCERPT_MAX}
            rows={2}
            onChange={(event) => set("excerpt", event.target.value)}
            error={errors.excerpt}
            hint="Одно-два предложения для списка новостей."
          />
          <MediaField label="Обложка" mediaId={form.coverMediaId} onChange={(coverMediaId) => set("coverMediaId", coverMediaId)} />

          <div className={styles.bodyTabs} role="tablist" aria-label="Текст новости">
            <Button
              variant={pane === "text" ? "primary" : "ghost"}
              isSmall
              role="tab"
              aria-selected={pane === "text"}
              onClick={() => setPane("text")}
            >
              Текст
            </Button>
            <Button
              variant={pane === "preview" ? "primary" : "ghost"}
              isSmall
              role="tab"
              aria-selected={pane === "preview"}
              onClick={() => setPane("preview")}
            >
              Предпросмотр
            </Button>
          </div>
          <div className={styles.bodyPanes}>
            <div hidden={pane !== "text"}>
              <TextAreaField
                label="Текст новости"
                value={form.bodyMarkdown}
                maxLength={NEWS_BODY_MAX}
                rows={16}
                onChange={(event) => set("bodyMarkdown", event.target.value)}
                error={errors.bodyMarkdown}
              />
              <Cheatsheet />
            </div>
            <div hidden={pane !== "preview"} className={styles.preview}>
              <p className={styles.previewLabel}>Так будет на сайте</p>
              {form.bodyMarkdown.trim() === "" ? <p>Текст пока пуст.</p> : <Markdown text={form.bodyMarkdown} />}
            </div>
          </div>

          <FormErrors messages={mutation.errors} />
          <FormActions>
            <Button type="submit" isBusy={mutation.isPending} disabled={post !== null && !isDirty}>
              {post === null ? "Сохранить черновик" : "Сохранить"}
            </Button>
          </FormActions>
        </form>
      </Section>

      <ConfirmDialog
        isOpen={statusChange !== null}
        title={statusChange === "published" ? "Опубликовать новость?" : "Снять с публикации?"}
        description={
          <p>
            {statusChange === "published"
              ? "Новость появится на сайте и в списке на странице «Отчёты»."
              : "Страница новости перестанет открываться, новость пропадёт из списка на сайте."}
          </p>
        }
        confirmLabel={statusChange === "published" ? "Опубликовать" : "Снять"}
        isBusy={isBusy}
        onConfirm={changeStatus}
        onCancel={() => setStatusChange(null)}
      />
      <ConfirmDialog
        isOpen={isDeleting}
        title="Удалить новость?"
        description={<p>Новость удалится насовсем. Обложка останется в медиатеке.</p>}
        confirmLabel="Удалить"
        isDanger
        isBusy={isBusy}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleting(false)}
      />
    </>
  );
}
