import type { PaymentConfig } from '../../config/configuration';
import {
  OutSumParseError,
  buildInitSignatureSource,
  hashSignature,
  parseOutSumToKopecks,
  signaturesMatch,
} from '../robokassa/signature';
import type { ShpParams } from '../robokassa/signature';
import { CHECKOUT_KNOWN_PARAMS } from './emulator.constants';

/**
 * Разбор и проверка ссылки на оплату — так же строго, как это делает
 * Robokassa. Главный смысл эмулятора: битую подпись должны ловить мы,
 * а не донатер на боевом.
 *
 * Query разбирается вручную, а не DTO: `Shp_*` — параметры с произвольными
 * именами, и whitelist class-validator их не выразит. Строгость от этого
 * не теряется — неизвестный параметр отклоняется так же.
 */

export interface CheckoutOrder {
  readonly merchantLogin: string;
  readonly outSum: string;
  readonly amountKopecks: bigint;
  readonly invId: string;
  readonly description: string;
  readonly shp: ShpParams;
}

export class CheckoutRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutRejectedError';
  }
}

const INV_ID_PATTERN = /^[1-9][0-9]{0,9}$/;

function readStrings(query: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const [name, value] of Object.entries(query)) {
    if (typeof value !== 'string') {
      // Массив — дублированный ключ: какую копию подписали, неизвестно.
      throw new CheckoutRejectedError(`Параметр ${name} передан несколько раз`);
    }

    if (!CHECKOUT_KNOWN_PARAMS.has(name) && !name.toLowerCase().startsWith('shp_')) {
      throw new CheckoutRejectedError(`Неизвестный параметр ${name}`);
    }

    values[name] = value;
  }

  return values;
}

function required(values: Readonly<Record<string, string>>, name: string): string {
  const value = values[name];

  if (value === undefined || value.length === 0) {
    throw new CheckoutRejectedError(`Нет обязательного параметра ${name}`);
  }

  return value;
}

function readAmount(outSum: string): bigint {
  try {
    return parseOutSumToKopecks(outSum);
  } catch (error: unknown) {
    if (error instanceof OutSumParseError) {
      throw new CheckoutRejectedError(`OutSum не разбирается: "${outSum}"`);
    }

    throw error;
  }
}

export function parseCheckoutRequest(
  query: Readonly<Record<string, unknown>>,
  payment: PaymentConfig,
): CheckoutOrder {
  const values = readStrings(query);
  const merchantLogin = required(values, 'MerchantLogin');
  const outSum = required(values, 'OutSum');
  const invId = required(values, 'InvId');
  const signature = required(values, 'SignatureValue');

  if (merchantLogin !== payment.merchantId) {
    throw new CheckoutRejectedError(`Магазин «${merchantLogin}» не найден`);
  }

  if (values.IsTest !== '1') {
    // Эмулятор — только тестовый режим: ссылка без IsTest=1 на боевой
    // Robokassa списала бы настоящие деньги, и здесь это надо увидеть.
    throw new CheckoutRejectedError('Ссылка без IsTest=1: эмулятор принимает только тестовые платежи');
  }

  if (!INV_ID_PATTERN.test(invId)) {
    throw new CheckoutRejectedError(`InvId не число: "${invId}"`);
  }

  const amountKopecks = readAmount(outSum);
  const shp: Record<string, string> = {};

  for (const [name, value] of Object.entries(values)) {
    if (name.toLowerCase().startsWith('shp_')) {
      shp[name] = value;
    }
  }

  const receipt = values.Receipt;
  const expected = hashSignature(
    buildInitSignatureSource({
      merchantLogin,
      outSum,
      invId,
      // В подпись чек идёт URL-кодированным — так же, как его кодирует провайдер.
      receipt: receipt === undefined ? undefined : encodeURIComponent(receipt),
      password: payment.secretKey,
      shp,
    }),
    payment.hashAlgorithm,
  );

  if (!signaturesMatch(expected, signature)) {
    throw new CheckoutRejectedError('Подпись ссылки не сошлась (пароль #1, алгоритм или состав Shp_)');
  }

  return {
    merchantLogin,
    outSum,
    amountKopecks,
    invId,
    description: values.Description ?? '',
    shp,
  };
}
