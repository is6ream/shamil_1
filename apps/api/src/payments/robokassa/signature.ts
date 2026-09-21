import { createHash, timingSafeEqual } from 'node:crypto';

import { KOPECKS_IN_RUBLE } from '../../config/constants';
import type { PaymentHashAlgorithm } from '../../config/env.validation';

/**
 * Подпись Robokassa — чистые функции, без Nest и без конфига.
 *
 * Вынесено отдельно намеренно: это единственное место во всём платёжном
 * модуле, где ошибка не видна ни в типах, ни в логах — подпись просто
 * не сходится, и провайдер отвергает каждый платёж. Такое проверяется
 * тестами на известных значениях, а для этого код не должен требовать
 * поднятого контейнера.
 *
 * Формулы (docs.robokassa.ru, «Интерфейс оплаты» и «Уведомления и переадресация»):
 *   ссылка:  MerchantLogin:OutSum:InvId:Пароль#1[:Shp_*]
 *   с чеком: MerchantLogin:OutSum:InvId:Receipt:Пароль#1[:Shp_*]
 *   колбэк:  OutSum:InvId:Пароль#2[:Shp_*]
 */

/** Пользовательские параметры: только имена с префиксом Shp_. */
export type ShpParams = Readonly<Record<string, string>>;

/**
 * Robokassa требует сортировать Shp_-параметры строго по имени.
 * Порядок обязан совпасть с тем, в каком их пересобирает она сама,
 * иначе подпись не сойдётся — а отладить это по её ответу невозможно.
 */
export function formatShpParams(params: ShpParams): readonly string[] {
  return Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name] ?? ''}`);
}

export function hashSignature(source: string, algorithm: PaymentHashAlgorithm): string {
  return createHash(algorithm).update(source, 'utf8').digest('hex');
}

/**
 * Сравнение подписей: регистронезависимое (Robokassa отдаёт hex в верхнем
 * регистре, Node считает в нижнем) и за постоянное время — подпись проверяет
 * секрет, и по времени ответа её не должно быть видно.
 */
export function signaturesMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected.trim().toLowerCase(), 'utf8');
  const right = Buffer.from(received.trim().toLowerCase(), 'utf8');

  // timingSafeEqual требует одинаковой длины; разная длина — заведомо не подпись.
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export interface InitSignatureInput {
  readonly merchantLogin: string;
  readonly outSum: string;
  readonly invId: string;
  /** Уже URL-кодированный JSON чека. Документация требует кодировать ДО подписи. */
  readonly receipt?: string;
  /** Пароль #1. */
  readonly password: string;
  readonly shp?: ShpParams;
}

export function buildInitSignatureSource(input: InitSignatureInput): string {
  const parts = [input.merchantLogin, input.outSum, input.invId];

  if (input.receipt !== undefined) {
    parts.push(input.receipt);
  }

  parts.push(input.password, ...formatShpParams(input.shp ?? {}));

  return parts.join(':');
}

export interface ResultSignatureInput {
  /** Сырая строка из тела колбэка — подпись считается ровно по тому, что прислали. */
  readonly outSum: string;
  readonly invId: string;
  /** Пароль #2. */
  readonly password: string;
  readonly shp?: ShpParams;
}

export function buildResultSignatureSource(input: ResultSignatureInput): string {
  return [
    input.outSum,
    input.invId,
    input.password,
    ...formatShpParams(input.shp ?? {}),
  ].join(':');
}

/**
 * Копейки → сумма для Robokassa: `123.45`.
 * Деление целочисленное, через BigInt: рубли на сайте считаются в копейках,
 * и ни одна сумма не должна по дороге стать числом с плавающей точкой.
 */
export function formatOutSum(amountKopecks: bigint): string {
  const base = BigInt(KOPECKS_IN_RUBLE);
  const rubles = amountKopecks / base;
  const kopecks = amountKopecks % base;

  return `${rubles}.${kopecks.toString().padStart(2, '0')}`;
}

export class OutSumParseError extends Error {
  constructor(raw: string) {
    super(`Сумма из колбэка не разбирается в копейки: "${raw}"`);
    this.name = 'OutSumParseError';
  }
}

const OUT_SUM_PATTERN = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Сумма из колбэка → копейки. Robokassa присылает её с разным числом знаков
 * («100.000000» в примерах документации), поэтому разбираем строку сами:
 * parseFloat дал бы двоичное приближение, а это деньги сбора.
 *
 * Значащие знаки после копеек — ошибка, а не повод округлить: молча потерянная
 * или добавленная копейка разведёт сумму сбора с выпиской банка.
 */
export function parseOutSumToKopecks(raw: string): bigint {
  const match = OUT_SUM_PATTERN.exec(raw.trim());

  if (match === null) {
    throw new OutSumParseError(raw);
  }

  const [, whole = '0', fraction = ''] = match;
  const padded = fraction.padEnd(2, '0');

  if (/[^0]/.test(padded.slice(2))) {
    throw new OutSumParseError(raw);
  }

  return BigInt(whole) * BigInt(KOPECKS_IN_RUBLE) + BigInt(padded.slice(0, 2));
}
