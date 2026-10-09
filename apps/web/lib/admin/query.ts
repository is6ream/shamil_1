/**
 * Query-строка для API: пустые значения не отправляем.
 *
 * Лишний или пустой параметр — 400 (`forbidNonWhitelisted` и валидаторы
 * формата), поэтому фильтр «не выбран» должен просто отсутствовать.
 */

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    const text = String(value).trim();

    if (text !== "") {
      search.set(key, text);
    }
  }

  const query = search.toString();

  return query === "" ? "" : `?${query}`;
}

/** Путь с query: `withQuery("/admin/news", { page: 2 })` → `/admin/news?page=2`. */
export function withQuery(path: string, params: Readonly<Record<string, QueryValue>>): string {
  return `${path}${buildQuery(params)}`;
}
