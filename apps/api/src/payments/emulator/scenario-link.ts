import { createHmac, timingSafeEqual } from 'node:crypto';

import { EMULATOR_METHODS, EMULATOR_SCENARIOS } from './emulator.constants';
import type { EmulatorMethod, EmulatorScenario } from './emulator.constants';

/**
 * Ссылка сценария эмулятора подписана HMAC.
 *
 * Эмулятор держит пароль #2 и подпишет колбэк на что угодно, — значит,
 * ссылку «оплатить» нельзя давать собирать руками: иначе заказ на 100 ₽
 * «оплачивается» миллионом правкой одного параметра. Ключ подписи — случайный
 * на каждый запуск процесса, пароли Robokassa для этого не переиспользуются.
 */

export interface ScenarioOrder {
  readonly outSum: string;
  readonly invId: string;
  readonly shp: Readonly<Record<string, string>>;
}

export interface ScenarioPayload {
  readonly order: ScenarioOrder;
  readonly scenario: EmulatorScenario;
  readonly method: EmulatorMethod;
  /** Unix-время в мс, после которого ссылка недействительна. */
  readonly expiresAt: number;
}

export interface SignedScenario {
  /** base64url(JSON) — сам сценарий. */
  readonly p: string;
  /** HMAC-SHA256 от `p`, hex. */
  readonly s: string;
}

export class ScenarioLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioLinkError';
  }
}

function hmac(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

export function signScenario(key: Buffer, payload: ScenarioPayload): SignedScenario {
  const p = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return { p, s: hmac(key, p) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isScenario(value: unknown): value is EmulatorScenario {
  return typeof value === 'string' && (EMULATOR_SCENARIOS as readonly string[]).includes(value);
}

function isMethod(value: unknown): value is EmulatorMethod {
  return typeof value === 'string' && Object.hasOwn(EMULATOR_METHODS, value);
}

function parsePayload(raw: unknown): ScenarioPayload {
  if (!isRecord(raw) || !isRecord(raw.order)) {
    throw new ScenarioLinkError('Ссылка сценария повреждена');
  }

  const { order, scenario, method, expiresAt } = raw;

  if (
    typeof order.outSum !== 'string' ||
    typeof order.invId !== 'string' ||
    !isStringRecord(order.shp) ||
    !isScenario(scenario) ||
    !isMethod(method) ||
    typeof expiresAt !== 'number'
  ) {
    throw new ScenarioLinkError('Ссылка сценария повреждена');
  }

  return { order: { outSum: order.outSum, invId: order.invId, shp: order.shp }, scenario, method, expiresAt };
}

/** Проверка подписи — до разбора JSON, за постоянное время. */
export function verifyScenario(key: Buffer, signed: SignedScenario, now: number = Date.now()): ScenarioPayload {
  const expected = Buffer.from(hmac(key, signed.p), 'utf8');
  const received = Buffer.from(signed.s.toLowerCase(), 'utf8');

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new ScenarioLinkError('Подпись ссылки сценария не сошлась');
  }

  let raw: unknown;

  try {
    raw = JSON.parse(Buffer.from(signed.p, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new ScenarioLinkError('Ссылка сценария повреждена');
  }

  const payload = parsePayload(raw);

  if (payload.expiresAt < now) {
    throw new ScenarioLinkError('Ссылка сценария устарела — откройте страницу оплаты заново');
  }

  return payload;
}
