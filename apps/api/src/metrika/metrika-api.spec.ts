import { HttpMetrikaApi, MetrikaApiError, isRetryableStatus, maskSecret } from './metrika-api';
import type { FetchLike } from './metrika-api';

/**
 * HTTP-адаптер Метрики на фейковом `fetch`: ни одного запроса в сеть.
 * Проверяется ровно то, что уходит по проводу, и реакция на ответы.
 */

const TOKEN = 'y0_AgAAAAB-secret-oauth-token-1234567890';
const COUNTER_ID = 98765432;

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function first<T>(items: readonly T[]): T {
  const [item] = items;

  if (item === undefined) {
    throw new Error('Ожидался хотя бы один элемент');
  }

  return item;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const UPLOADING_OK = { uploading: { id: 123456, status: 'UPLOADED', source_quantity: 2, line_quantity: 2 } };

/** Фейк, отвечающий по очереди заготовленными ответами (или бросающий ошибку). */
function fakeFetch(responses: readonly (Response | Error)[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];

  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const next = queue.shift();

      if (next === undefined) {
        return Promise.reject(new Error('Лишний запрос: ответов не осталось'));
      }

      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
}

function createApi(responses: readonly (Response | Error)[]) {
  const fake = fakeFetch(responses);
  const sleeps: number[] = [];
  const api = new HttpMetrikaApi({
    counterId: COUNTER_ID,
    token: TOKEN,
    fetch: fake.fetch,
    sleep: (ms) => {
      sleeps.push(ms);

      return Promise.resolve();
    },
  });

  return { api, calls: fake.calls, sleeps };
}

describe('HttpMetrikaApi', () => {
  test.each([[3, 2], [3, 0], [null, null], [-1, 1]])('retains acceptance counts %p / %p without retrying accepted upload', async (source, accepted) => {
    const { api, calls } = createApi([jsonResponse(200, { uploading: { id: 42, status: 'PROCESSED', source_quantity: source, line_quantity: accepted } })]);
    const result = await api.getUploading(42n);
    expect(result.sourceQuantity).toBe(source === -1 ? null : source);
    expect(result.lineQuantity).toBe(accepted);
    expect(calls).toHaveLength(1);
  });
  test('API response with personal data never appears in error', async () => {
    const { api } = createApi([jsonResponse(400, { error: 'person@example.com +79991234567' })]);
    await expect(api.getUploading(42n)).rejects.toThrow('Метрика ответила 400');
    await expect(createApi([jsonResponse(400, { error: 'person@example.com' })]).api.getUploading(42n)).rejects.not.toThrow('person@example.com');
  });
  test('upload: POST multipart на путь счётчика, заголовок OAuth, поле file с CSV', async () => {
    // Arrange
    const { api, calls } = createApi([jsonResponse(200, UPLOADING_OK)]);
    const csv = 'ClientId,Target,DateTime,Price,Currency\n1,donation_paid,1,100.00,RUB\n';

    // Act
    const result = await api.uploadOfflineConversions({ csv, comment: 'тест' });

    // Assert
    expect(result).toEqual({ id: 123456n, status: 'UPLOADED', sourceQuantity: 2, lineQuantity: 2 });
    expect(calls).toHaveLength(1);

    const call = first(calls);
    const url = new URL(call.url);

    expect(call.init.method).toBe('POST');
    expect(url.origin).toBe('https://api-metrika.yandex.net');
    expect(url.pathname).toBe(`/management/v1/counter/${COUNTER_ID}/offline_conversions/upload`);
    expect(url.searchParams.get('comment')).toBe('тест');
    expect(call.init.headers).toEqual({ Authorization: `OAuth ${TOKEN}` });

    const form = call.init.body as FormData;
    const file = form.get('file') as File;

    expect(file).toBeInstanceOf(Blob);
    expect(await file.text()).toBe(csv);
  });

  test('comment обрезается до 255 символов', async () => {
    // Arrange
    const { api, calls } = createApi([jsonResponse(200, UPLOADING_OK)]);

    // Act
    await api.uploadOfflineConversions({ csv: 'x', comment: 'я'.repeat(400) });

    // Assert
    expect(new URL(first(calls).url).searchParams.get('comment')).toHaveLength(255);
  });

  test('getUploading: GET статуса по номеру загрузки', async () => {
    // Arrange
    const { api, calls } = createApi([jsonResponse(200, { uploading: { id: '77', status: 'PROCESSED' } })]);

    // Act
    const result = await api.getUploading(77n);

    // Assert
    expect(result).toEqual({ id: 77n, status: 'PROCESSED', sourceQuantity: null, lineQuantity: null });
    expect(first(calls).init.method).toBe('GET');
    expect(new URL(first(calls).url).pathname).toBe(
      `/management/v1/counter/${COUNTER_ID}/offline_conversions/uploading/77`,
    );
  });

  test('429 и 5xx повторяются с экспоненциальной паузой', async () => {
    // Arrange
    const { api, calls, sleeps } = createApi([
      jsonResponse(429, { message: 'slow down' }),
      jsonResponse(503, { message: 'unavailable' }),
      jsonResponse(200, UPLOADING_OK),
    ]);

    // Act
    const result = await api.uploadOfflineConversions({ csv: 'x', comment: 'c' });

    // Assert
    expect(result.id).toBe(123456n);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  test('сетевая ошибка повторяется, исчерпав попытки — retryable MetrikaApiError', async () => {
    // Arrange
    const { api, calls } = createApi(Array.from({ length: 4 }, () => new Error('ECONNRESET')));

    // Act
    const error = await api.uploadOfflineConversions({ csv: 'x', comment: 'c' }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(MetrikaApiError);
    expect((error as MetrikaApiError).retryable).toBe(true);
    expect((error as MetrikaApiError).status).toBeNull();
    expect(calls).toHaveLength(4);
  });

  test.each([400, 401, 403, 404])('%p — без повторов, retryable=false', async (status) => {
    // Arrange
    const { api, calls } = createApi([jsonResponse(status, { message: 'bad' })]);

    // Act
    const error = await api.uploadOfflineConversions({ csv: 'x', comment: 'c' }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(MetrikaApiError);
    expect((error as MetrikaApiError).status).toBe(status);
    expect((error as MetrikaApiError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test('токен не попадает в текст ошибки, даже если API его процитировал', async () => {
    // Arrange
    const { api } = createApi([jsonResponse(401, { message: `invalid token ${TOKEN}` })]);

    // Act
    const error = (await api.uploadOfflineConversions({ csv: 'x', comment: 'c' }).catch((e: unknown) => e)) as Error;

    // Assert
    expect(error.message).toContain('401');
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain('invalid token');
  });

  test('токен маскируется и в сетевой ошибке', async () => {
    // Arrange
    const { api } = createApi(Array.from({ length: 4 }, () => new Error(`proxy rejected OAuth ${TOKEN}`)));

    // Act
    const error = (await api.getUploading(1n).catch((e: unknown) => e)) as Error;

    // Assert
    expect(error.message).not.toContain(TOKEN);
  });

  test('fetch отклонён не-Error значением — всё равно MetrikaApiError', async () => {
    // Arrange
    const api = new HttpMetrikaApi({
      counterId: COUNTER_ID,
      token: TOKEN,
      maxRetries: 0,
      fetch: () => Promise.reject(`socket hang up ${TOKEN}`),
    });

    // Act
    const error = (await api.getUploading(1n).catch((e: unknown) => e)) as MetrikaApiError;

    // Assert
    expect(error).toBeInstanceOf(MetrikaApiError);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain(TOKEN);
  });

  test('ответ без uploading.id — ошибка без повторов', async () => {
    // Arrange
    const { api, calls } = createApi([jsonResponse(200, { errors: [] })]);

    // Act
    const error = await api.getUploading(1n).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(MetrikaApiError);
    expect((error as MetrikaApiError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('maskSecret и isRetryableStatus', () => {
  test('все вхождения секрета заменяются, пустой секрет не трогает текст', () => {
    expect(maskSecret('a SECRET b SECRET', 'SECRET')).toBe('a *** b ***');
    expect(maskSecret('text', '')).toBe('text');
    expect(maskSecret('text', undefined)).toBe('text');
  });

  test.each([
    [429, true],
    [500, true],
    [502, true],
    [400, false],
    [401, false],
    [404, false],
  ])('%p → %p', (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected);
  });
});
