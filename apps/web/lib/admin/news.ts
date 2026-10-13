/** Форма новости (API.md §12). */

import { findMarkdownProblem } from "./markdown";
import type { AdminNewsPost, NewsBody } from "./types";

export const NEWS_TITLE_MAX = 200;
export const NEWS_SLUG_MAX = 120;
export const NEWS_EXCERPT_MAX = 500;
export const NEWS_BODY_MAX = 100_000;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface NewsForm {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string;
  readonly bodyMarkdown: string;
  readonly coverMediaId: string | null;
}

export type NewsErrors = Partial<Record<keyof NewsForm, string>>;

export type NewsCheck = { readonly ok: true; readonly body: NewsBody } | { readonly ok: false; readonly errors: NewsErrors };

export const EMPTY_NEWS_FORM: NewsForm = { title: "", slug: "", excerpt: "", bodyMarkdown: "", coverMediaId: null };

export function newsToForm(post: AdminNewsPost): NewsForm {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    bodyMarkdown: post.bodyMarkdown,
    coverMediaId: post.coverMediaId,
  };
}

/**
 * Тело POST/PATCH без `status` — публикация отдельной кнопкой.
 * Пустой slug не отправляем: сервер сделает транслит заголовка.
 */
export function checkNews(form: NewsForm): NewsCheck {
  const errors: NewsErrors = {};
  const title = form.title.trim();
  const slug = form.slug.trim();
  const excerpt = form.excerpt.trim();
  const body = form.bodyMarkdown;

  if (title === "" || title.length > NEWS_TITLE_MAX) {
    errors.title = `Заголовок — от 1 до ${NEWS_TITLE_MAX} символов.`;
  }

  if (slug !== "" && (slug.length > NEWS_SLUG_MAX || !SLUG_PATTERN.test(slug))) {
    errors.slug = "Только латиница в нижнем регистре, цифры и дефисы между словами: zalili-fundament.";
  }

  if (excerpt.length > NEWS_EXCERPT_MAX) {
    errors.excerpt = `Анонс — не длиннее ${NEWS_EXCERPT_MAX} символов.`;
  }

  if (body.trim() === "" || body.length > NEWS_BODY_MAX) {
    errors.bodyMarkdown = `Текст — от 1 до ${NEWS_BODY_MAX.toLocaleString("ru-RU")} символов.`;
  } else {
    const problem = findMarkdownProblem(body);

    if (problem !== null) {
      errors.bodyMarkdown = problem;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      title,
      ...(slug === "" ? {} : { slug }),
      excerpt: excerpt === "" ? null : excerpt,
      bodyMarkdown: body,
      coverMediaId: form.coverMediaId,
    },
  };
}

/** Публичный адрес новости (D-12). */
export function newsPublicPath(slug: string): string {
  return `/novosti/${encodeURIComponent(slug)}`;
}
