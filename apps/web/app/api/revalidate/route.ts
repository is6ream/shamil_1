import { revalidateTag } from "next/cache";

import {
  MAX_REVALIDATE_BODY_BYTES,
  isAuthorizedRevalidation,
  parseRevalidateBody,
} from "@/lib/revalidate";

/**
 * Сброс кеша витрины по тегам после правки в админке.
 *
 * Вызывает только бэкенд (`WEB_REVALIDATE_URL`) с общим секретом.
 * `{ expire: 0 }` — D-14: следующий посетитель сразу получает свежие данные,
 * а не один устаревший ответ, как с профилем `max`.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;

  if (secret === undefined || secret === "") {
    return Response.json({ error: "Ревалидация не настроена" }, { status: 503 });
  }

  if (!isAuthorizedRevalidation(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Неверный секрет" }, { status: 401 });
  }

  const raw = await request.text();

  if (Buffer.byteLength(raw, "utf8") > MAX_REVALIDATE_BODY_BYTES) {
    return Response.json({ error: "Слишком большое тело" }, { status: 413 });
  }

  const parsed = parseRevalidateBody(raw);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  for (const tag of parsed.tags) {
    revalidateTag(tag, { expire: 0 });
  }

  return Response.json({ revalidated: parsed.tags });
}
