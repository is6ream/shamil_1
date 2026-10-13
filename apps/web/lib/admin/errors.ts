/**
 * Единый тип ошибки админки с понятным русским текстом.
 *
 * Тело ошибки Nest (`message`: строка или массив строк от class-validator)
 * показываем как есть только для 400/409/422 — там сервер объясняет, что не так
 * с данными. На остальные коды текст свой: «Forbidden resource» или стек 500
 * заказчику ничего не скажут.
 */

/** Сетевой сбой: до HTTP-кода дело не дошло. */
export const NETWORK_ERROR_STATUS = 0;

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  [NETWORK_ERROR_STATUS]: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.",
  401: "Сессия закончилась. Войдите снова.",
  403: "Недостаточно прав для этого действия.",
  404: "Запись не найдена — возможно, её уже удалили.",
  413: "Файл слишком большой.",
  429: "Слишком много попыток подряд. Подождите минуту и попробуйте снова.",
};

const SERVER_ERROR_MESSAGE = "Ошибка на сервере. Попробуйте ещё раз через минуту.";
const FALLBACK_MESSAGE = "Не удалось выполнить запрос. Попробуйте ещё раз.";

/** Коды, где текст сервера адресован человеку, заполняющему форму. */
const DATA_ERROR_STATUSES: ReadonlySet<number> = new Set([400, 409, 422]);

export class AdminApiError extends Error {
  readonly status: number;
  readonly messages: readonly string[];
  /** Разобранное тело ответа — для особых тел вроде 409 `usages` у медиатеки. */
  readonly body: unknown;

  constructor(status: number, messages: readonly string[], body: unknown = null) {
    super(messages[0] ?? FALLBACK_MESSAGE);
    this.name = "AdminApiError";
    this.status = status;
    this.messages = messages;
    this.body = body;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serverMessages(body: unknown): readonly string[] {
  if (!isRecord(body)) {
    return [];
  }

  const { message } = body;

  if (typeof message === "string" && message !== "") {
    return [message];
  }

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string" && item !== "");
  }

  return [];
}

/** Ошибка из HTTP-ответа: статус и разобранное (или `null`) тело. */
export function toAdminApiError(status: number, body: unknown): AdminApiError {
  if (DATA_ERROR_STATUSES.has(status)) {
    const fromServer = serverMessages(body);

    return new AdminApiError(status, fromServer.length > 0 ? fromServer : [FALLBACK_MESSAGE], body);
  }

  const known = STATUS_MESSAGES[status];

  if (known !== undefined) {
    return new AdminApiError(status, [known]);
  }

  return new AdminApiError(status, [status >= 500 ? SERVER_ERROR_MESSAGE : FALLBACK_MESSAGE]);
}

export function networkError(): AdminApiError {
  return toAdminApiError(NETWORK_ERROR_STATUS, null);
}

/** Текст для экрана из чего угодно, что прилетело в `catch`. */
export function errorMessage(error: unknown): string {
  return error instanceof AdminApiError ? error.message : FALLBACK_MESSAGE;
}
