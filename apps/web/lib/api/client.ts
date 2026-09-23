/**
 * Боевые вызовы бэкенда. Эти два эндпоинта уже существуют
 * (apps/api/src/donations/donations.controller.ts), моков здесь нет.
 *
 * Компоненты не знают ни про `fetch`, ни про адрес API: они вызывают
 * `createDonation` и `getDonationStatus`, а ошибки ловят по `ApiError`.
 */

import { API_URL } from "@/lib/site";

import type {
  CreateDonationBody,
  CreatedDonationResponse,
  DonationStatusResponse,
} from "./types";

/** Сетевой сбой, до HTTP-кода дело не дошло. */
const NETWORK_ERROR_STATUS = 0;

/** Троттлинг формы доната: 10 запросов за 60 с на IP. */
const TOO_MANY_REQUESTS = 429;

const FALLBACK_MESSAGE = "Не удалось выполнить запрос. Попробуйте ещё раз.";

const NETWORK_MESSAGE =
  "Не получилось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";

/**
 * Текст на 429 пишем свой: Nest отдаёт «ThrottlerException: Too many requests»,
 * и показывать это человеку, который пытается пожертвовать, нельзя.
 */
const THROTTLED_MESSAGE =
  "Слишком много попыток подряд. Подождите минуту и отправьте форму снова.";

/**
 * Ошибка бэкенда с разобранным телом.
 *
 * `messages` — массив, потому что class-validator при нескольких нарушениях
 * возвращает массив строк, и терять все, кроме первой, нельзя: именно там
 * лежит настоящая причина 400.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: readonly string[];

  constructor(status: number, messages: readonly string[]) {
    super(messages[0] ?? FALLBACK_MESSAGE);
    this.name = "ApiError";
    this.status = status;
    this.messages = messages;
  }

  /** Троттлинг — не ошибка данных: форму можно отправить повторно. */
  get isThrottled(): boolean {
    return this.status === TOO_MANY_REQUESTS;
  }

  get isNetwork(): boolean {
    return this.status === NETWORK_ERROR_STATUS;
  }
}

/** Форма ошибки Nest: `message` бывает и строкой, и массивом строк. */
interface NestErrorBody {
  readonly message?: string | string[];
  readonly error?: string;
  readonly statusCode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Достаёт человеко-читаемые сообщения, не доверяя форме чужого ответа. */
function extractMessages(body: unknown, status: number): readonly string[] {
  if (status === TOO_MANY_REQUESTS) {
    return [THROTTLED_MESSAGE];
  }

  if (!isRecord(body)) {
    return [FALLBACK_MESSAGE];
  }

  const { message } = body as NestErrorBody;

  if (typeof message === "string" && message !== "") {
    return [message];
  }

  if (Array.isArray(message)) {
    const strings = message.filter((item): item is string => typeof item === "string");

    if (strings.length > 0) {
      return strings;
    }
  }

  return [FALLBACK_MESSAGE];
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    // Пустое тело или не-JSON: сообщение возьмём из статуса, это не повод падать.
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      // Витрина кешируется, деньги — никогда: ответ на донат и статус заказа
      // обязаны быть свежими на каждый запрос.
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // Текст исключения `fetch` («Failed to fetch») человеку ничего не говорит
    // и меняется от браузера к браузеру — показываем своё сообщение.
    throw new ApiError(NETWORK_ERROR_STATUS, [NETWORK_MESSAGE]);
  }

  const body = await readBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessages(body, response.status));
  }

  return body as T;
}

/**
 * Создание заказа. Сервер сам назначает сумму списания и сам подписывает
 * ссылку — присланная клиентом сумма проверяется по диапазону и дальше
 * не используется нигде (CLAUDE.md, «Поток платежа»).
 *
 * Тело собирается только через `buildCreateDonationBody`: лишний ключ
 * в объекте — 400 от `forbidNonWhitelisted`.
 */
export function createDonation(body: CreateDonationBody): Promise<CreatedDonationResponse> {
  return request<CreatedDonationResponse>("/donations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Статус заказа для страницы «спасибо». Опрашивается 3 с × 10: редирект
 * пользователя почти всегда обгоняет вебхук провайдера.
 */
export function getDonationStatus(orderId: string): Promise<DonationStatusResponse> {
  return request<DonationStatusResponse>(
    `/donations/${encodeURIComponent(orderId)}/status`,
  );
}
