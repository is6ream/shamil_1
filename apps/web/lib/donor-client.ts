export async function donorRequest<T>(path: string, body?: unknown, key?: string): Promise<T> {
  let response: Response;
  try { response = await fetch("/api/" + path, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", referrerPolicy: "no-referrer" });
  } catch { throw new DonorRequestError("Ответ сервера не получен. Проверьте соединение и повторите попытку", 0, "SERVICE_UNAVAILABLE"); }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new DonorRequestError(data?.error?.message ?? "Запрос не выполнен. Повторите попытку", response.status, data?.error?.code ?? "SERVICE_UNAVAILABLE", Number(data?.error?.retryAfterSeconds ?? response.headers.get("Retry-After")) || undefined);
  if (response.status !== 204 && data === null) throw new DonorRequestError("Ответ сервера не получен. Повторите попытку", response.status, "SERVICE_UNAVAILABLE");
  return data as T;
}
export class DonorRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly retryAfterSeconds?: number) { super(message); }
}
