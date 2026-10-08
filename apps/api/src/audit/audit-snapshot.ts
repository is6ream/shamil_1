/**
 * Подготовка состояний «до/после» для журнала: сериализация, маскирование ПДн
 * и дифф только изменившихся полей.
 *
 * Маскирование — по имени поля, рекурсивно. Список закрытый: новое поле с ПДн
 * обязано попасть сюда, иначе оно уедет в журнал открытым текстом. Тест
 * `audit-snapshot.spec.ts` держит этот список.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const PII_MASK = '[скрыто]';

/**
 * Поля, значения которых в журнал не пишутся никогда: ПДн жертвователя
 * (152-ФЗ) и секреты. Сравнение без учёта регистра.
 */
const MASKED_KEYS = new Set(
  [
    'phone',
    'phoneE164',
    'phone_e164',
    'fullName',
    'full_name',
    'consentIp',
    'consent_ip',
    'email',
    'password',
    'passwordHash',
    'password_hash',
    'newPassword',
    'currentPassword',
    'tokenHash',
    'token_hash',
    'refreshToken',
    'accessToken',
  ].map((key) => key.toLowerCase()),
);

/**
 * Поля, которые можно не маскировать, хотя имя совпадает: e-mail пользователя
 * админки — это рабочий логин, а не ПДн жертвователя. Передаётся явно вызывающим.
 */
export interface SnapshotOptions {
  readonly allowKeys?: readonly string[];
}

function isMasked(key: string, allow: ReadonlySet<string>): boolean {
  const normalized = key.toLowerCase();

  return MASKED_KEYS.has(normalized) && !allow.has(normalized);
}

/** Произвольное значение → JSON для журнала. BigInt и Date — строками. */
export function toJsonValue(value: unknown, options: SnapshotOptions = {}): JsonValue {
  const allow = new Set((options.allowKeys ?? []).map((key) => key.toLowerCase()));

  return convert(value, allow);
}

function convert(value: unknown, allow: ReadonlySet<string>): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convert(item, allow));
  }

  if (typeof value === 'object') {
    const result: JsonObject = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = isMasked(key, allow) ? (item === null || item === undefined ? null : PII_MASK) : convert(item, allow);
    }

    return result;
  }

  // Функции и символы в журнал не попадают — их там не должно быть вовсе.
  return null;
}

export interface SnapshotDiff {
  readonly before: JsonObject | null;
  readonly after: JsonObject | null;
}

/**
 * Дифф двух состояний объекта: в журнал уходят только изменившиеся поля.
 * Если одно из состояний отсутствует (создание, удаление) — второе пишется целиком.
 */
export function diffSnapshots(before: unknown, after: unknown, options: SnapshotOptions = {}): SnapshotDiff {
  const left = asObject(toJsonValue(before, options));
  const right = asObject(toJsonValue(after, options));

  if (left === null || right === null) {
    return { before: left, after: right };
  }

  const changedBefore: JsonObject = {};
  const changedAfter: JsonObject = {};

  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const was = left[key] ?? null;
    const now = right[key] ?? null;

    if (JSON.stringify(was) !== JSON.stringify(now)) {
      changedBefore[key] = was;
      changedAfter[key] = now;
    }
  }

  return { before: changedBefore, after: changedAfter };
}

function asObject(value: JsonValue): JsonObject | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value === null ? null : { value };
  }

  return value;
}
