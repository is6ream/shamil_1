import {
  HTTP_MAX_RETRIES,
  HTTP_RETRY_BASE_DELAY_MS,
  HTTP_TIMEOUT_MS,
  METRIKA_API_BASE_URL,
  UPLOAD_COMMENT_MAX_LENGTH,
} from './metrika.constants';

/** Загрузка в Метрике: номер и статус обработки. */
export interface UploadingInfo {
  readonly id: bigint;
  readonly status: string;
  readonly sourceQuantity?: number | null;
  readonly lineQuantity?: number | null;
}

export interface UploadRequest {
  readonly csv: string;
  readonly comment: string;
}

/**
 * Порт Management API Метрики. Планировщик знает только его, поэтому
 * в тестах HTTP подменяется фейком без сети.
 */
export interface MetrikaApi {
  uploadOfflineConversions(request: UploadRequest): Promise<UploadingInfo>;
  getUploading(id: bigint): Promise<UploadingInfo>;
}

export const METRIKA_API = Symbol('METRIKA_API');

/**
 * Ошибка вызова API. `retryable` — стоит ли пробовать позже: 429, 5xx
 * и сетевые сбои — да; прочие 4xx (неверный токен, битый файл) — нет,
 * повтор того же запроса даст тот же ответ.
 */
export class MetrikaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MetrikaApiError';
  }
}

const MASK = '***';

/** Убирает секрет из текста: тело ошибки API могло процитировать заголовок. */
export function maskSecret(text: string, secret: string | undefined): string {
  return secret === undefined || secret.length === 0 ? text : text.split(secret).join(MASK);
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpMetrikaApiOptions {
  readonly counterId: number;
  readonly token: string;
  readonly fetch?: FetchLike;
  /** Пауза между повторами; в тестах — мгновенная. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Тело ответа, сокращённое для журнала. */


interface UploadingResponse {
  readonly uploading?: { readonly id?: unknown; readonly status?: unknown; readonly source_quantity?: unknown; readonly line_quantity?: unknown };
}

function parseUploading(payload: unknown): UploadingInfo {
  const uploading = (payload as UploadingResponse | null)?.uploading;
  const id = uploading?.id;
  const status = uploading?.status;

  if (!(typeof id === 'number' ? Number.isSafeInteger(id) && id > 0 : typeof id === 'string' && /^[1-9][0-9]*$/.test(id)) || typeof status !== 'string') {
    throw new MetrikaApiError('Метрика вернула ответ без uploading.id/status', null, false);
  }

  const quantity = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { id: BigInt(String(id)), status, sourceQuantity: quantity(uploading?.source_quantity), lineQuantity: quantity(uploading?.line_quantity) };
}

/** Адаптер Management API на `fetch` Node 22. */
export class HttpMetrikaApi implements MetrikaApi {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: HttpMetrikaApiOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.baseUrl = options.baseUrl ?? METRIKA_API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? HTTP_MAX_RETRIES;
  }

  uploadOfflineConversions(request: UploadRequest): Promise<UploadingInfo> {
    const query = new URLSearchParams({ comment: request.comment.slice(0, UPLOAD_COMMENT_MAX_LENGTH) });

    // FormData собирается на каждую попытку: тело запроса читается один раз.
    return this.request(`offline_conversions/upload?${query.toString()}`, () => {
      const form = new FormData();

      form.append('file', new Blob([request.csv], { type: 'text/csv; charset=utf-8' }), 'conversions.csv');

      return { method: 'POST', body: form };
    });
  }

  getUploading(id: bigint): Promise<UploadingInfo> {
    return this.request(`offline_conversions/uploading/${id.toString()}`, () => ({ method: 'GET' }));
  }

  private async request(path: string, init: () => RequestInit): Promise<UploadingInfo> {
    const url = `${this.baseUrl}/management/v1/counter/${this.options.counterId}/${path}`;
    let lastError: MetrikaApiError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(HTTP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }

      try {
        return await this.send(url, init());
      } catch (error: unknown) {
        lastError = this.toApiError(error);

        if (!lastError.retryable) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new MetrikaApiError('Метрика: запрос не выполнен', null, true);
  }

  private async send(url: string, init: RequestInit): Promise<UploadingInfo> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `OAuth ${this.options.token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {


      throw new MetrikaApiError(
        this.mask(`Метрика ответила ${response.status}`),
        response.status,
        isRetryableStatus(response.status),
      );
    }

    return parseUploading(await response.json());
  }

  /** Всё, что не ответ API (таймаут, DNS, обрыв), — сетевой сбой, его можно повторить. */
  private toApiError(error: unknown): MetrikaApiError {
    if (error instanceof MetrikaApiError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    return new MetrikaApiError(this.mask(`Метрика недоступна: ${message}`), null, true);
  }

  private mask(text: string): string {
    return maskSecret(text, this.options.token);
  }
}
