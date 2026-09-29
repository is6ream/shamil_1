/**
 * Курсор живой ленты: позиция последней отданной строки `(paid_at, id)`.
 *
 * Для фронтенда он непрозрачен — base64url от JSON. Разбирать его клиенту
 * незачем, а смена схемы пагинации тогда не требует правки фронта.
 * Keyset вместо OFFSET: у референса лента на 2388 страниц, и OFFSET
 * на такой таблице — это полный скан до нужной страницы.
 */

export interface FeedCursor {
  readonly paidAt: Date;
  readonly id: string;
}

/** Курсор пришёл из query-строки — это пользовательский ввод, и он бывает битым. */
export class FeedCursorError extends Error {
  constructor() {
    super('Некорректный курсор ленты');
    this.name = 'FeedCursorError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(
    JSON.stringify({ paidAt: cursor.paidAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
  } catch {
    // Причина не важна — мусор в курсоре; контроллер ответит 400, а не 500.
    throw new FeedCursorError();
  }
}

export function decodeFeedCursor(raw: string): FeedCursor {
  const parsed = parseJson(raw);

  if (!isRecord(parsed) || typeof parsed.paidAt !== 'string' || typeof parsed.id !== 'string') {
    throw new FeedCursorError();
  }

  const paidAt = new Date(parsed.paidAt);

  // uuid проверяется до базы: иначе Postgres ответит ошибкой приведения типа,
  // и битый курсор превратится в 500.
  if (Number.isNaN(paidAt.getTime()) || !UUID_PATTERN.test(parsed.id)) {
    throw new FeedCursorError();
  }

  return { paidAt, id: parsed.id };
}
