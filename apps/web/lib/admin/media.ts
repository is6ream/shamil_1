/**
 * Медиатека (API.md §7): проверки файла до отправки и разбор 409 `usages`.
 *
 * Сервер проверяет формат по содержимому, здесь — по типу и расширению,
 * чтобы не гонять 15 МБ по мобильной сети ради отказа.
 */

import { LIMITS } from "./endpoints";
import { AdminApiError } from "./errors";
import type { MediaUsage, MediaUsageType } from "./types";

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_EXTENSION = /\.(heic|heif)$/i;
const ALLOWED_EXTENSION = /\.(jpe?g|png|webp)$/i;

export const ACCEPT_ATTRIBUTE = LIMITS.uploadTypes.join(",");

export interface FileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/** `null` — файл можно отправлять; иначе — текст для человека. */
export function checkUploadFile(file: FileLike): string | null {
  if (HEIC_TYPES.has(file.type) || HEIC_EXTENSION.test(file.name)) {
    return `«${file.name}» — формат HEIC с iPhone. Сохраните фото как JPEG (в iPhone: Настройки → Камера → Форматы → «Наиболее совместимый») или отправьте себе и сохраните заново.`;
  }

  const isAllowedType = (LIMITS.uploadTypes as readonly string[]).includes(file.type);

  if (!isAllowedType && !(file.type === "" && ALLOWED_EXTENSION.test(file.name))) {
    return `«${file.name}» — не фото в JPEG, PNG или WebP.`;
  }

  if (file.size > LIMITS.uploadMaxBytes) {
    return `«${file.name}» больше ${LIMITS.uploadMaxBytes / 1024 / 1024} МБ (${formatBytes(file.size)}).`;
  }

  if (file.size === 0) {
    return `«${file.name}» пустой.`;
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }

  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

const USAGE_TYPES: ReadonlySet<string> = new Set<MediaUsageType>([
  "gallery_item",
  "video_link",
  "construction_stage",
  "news_post",
  "content_block",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** «Где используется» из 409 на удаление; не та ошибка — пустой список. */
export function usagesFromError(error: unknown): readonly MediaUsage[] {
  if (!(error instanceof AdminApiError) || error.status !== 409 || !isRecord(error.body)) {
    return [];
  }

  const { usages } = error.body;

  if (!Array.isArray(usages)) {
    return [];
  }

  return usages.filter(
    (usage): usage is MediaUsage =>
      isRecord(usage) &&
      typeof usage.entityType === "string" &&
      USAGE_TYPES.has(usage.entityType) &&
      typeof usage.entityId === "string" &&
      typeof usage.label === "string",
  );
}
