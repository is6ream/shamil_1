/**
 * Проверки запроса ревалидации от бэкенда (`app/api/revalidate/route.ts`).
 *
 * Вынесены из route handler, чтобы тестироваться без сервера Next.
 * Контракт с бэкендом — docs/admin/DECISIONS.md, D-F02.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Теги кеша витрины — строго список из `docs/admin/API.md`. */
export const REVALIDATE_TAGS = ["content", "stages", "news", "gallery", "video", "campaign"] as const;

export type RevalidateTag = (typeof REVALIDATE_TAGS)[number];

/** Тело больше этого — не наш бэкенд: шесть тегов занимают меньше 100 байт. */
export const MAX_REVALIDATE_BODY_BYTES = 1024;

const BEARER_PREFIX = "Bearer ";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Секрет из `Authorization: Bearer …`, сравнение за постоянное время.
 * Хешируем обе стороны: `timingSafeEqual` требует равной длины, а сравнение
 * длин заранее выдало бы длину секрета.
 */
export function isAuthorizedRevalidation(authorization: string | null, secret: string): boolean {
  if (authorization === null || !authorization.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const presented = authorization.slice(BEARER_PREFIX.length);

  return timingSafeEqual(digest(presented), digest(secret));
}

function isRevalidateTag(value: unknown): value is RevalidateTag {
  return typeof value === "string" && (REVALIDATE_TAGS as readonly string[]).includes(value);
}

export type ParsedRevalidateBody =
  | { readonly ok: true; readonly tags: readonly RevalidateTag[] }
  | { readonly ok: false; readonly error: string };

/** `{ tags: string[] }`: непустой массив тегов из allowlist, других ключей нет. */
export function parseRevalidateBody(raw: string): ParsedRevalidateBody {
  let body: unknown;

  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "Тело не JSON" };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Ожидается объект { tags }" };
  }

  const keys = Object.keys(body);

  if (keys.length !== 1 || keys[0] !== "tags") {
    return { ok: false, error: "Допустим только ключ tags" };
  }

  const { tags } = body as { tags: unknown };

  if (!Array.isArray(tags) || tags.length === 0) {
    return { ok: false, error: "tags — непустой массив" };
  }

  if (!tags.every(isRevalidateTag)) {
    return { ok: false, error: `Неизвестный тег; допустимы: ${REVALIDATE_TAGS.join(", ")}` };
  }

  return { ok: true, tags: [...new Set(tags)] };
}
