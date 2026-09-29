import type { PaymentConfig } from '../../config/configuration';
import { ROBOKASSA_CULTURE } from '../robokassa/robokassa.constants';
import {
  buildResultSignatureSource,
  formatOutSum,
  hashSignature,
  parseOutSumToKopecks,
} from '../robokassa/signature';
import { EMULATOR_METHODS, EMULATOR_PAYER_EMAIL, UNDERPAY_KOPECKS } from './emulator.constants';
import type { EmulatorMethod } from './emulator.constants';
import type { ScenarioOrder } from './scenario-link';

/**
 * Тело колбэка Result URL в том виде, в каком его шлёт Robokassa:
 * `OutSum`, `InvId`, `SignatureValue` = подпись `OutSum:InvId:Пароль#2[:Shp_…]`,
 * все `Shp_*`, способ оплаты и почта плательщика.
 */

export interface CallbackOptions {
  readonly method: EmulatorMethod;
  /** Оплачено на 1 ₽ меньше заказа — ветка расхождения суммы. */
  readonly underpaid?: boolean;
  /** Подпись посчитана не тем паролем — колбэк обязан получить 401. */
  readonly badSignature?: boolean;
}

/** Хвост к паролю, чтобы гарантированно получить чужую подпись. */
const WRONG_PASSWORD_SUFFIX = ':не-тот-пароль';

export function buildCallbackBody(
  order: ScenarioOrder,
  payment: PaymentConfig,
  options: CallbackOptions,
): Readonly<Record<string, string>> {
  const orderKopecks = parseOutSumToKopecks(order.outSum);
  const outSum =
    options.underpaid === true && orderKopecks > UNDERPAY_KOPECKS
      ? formatOutSum(orderKopecks - UNDERPAY_KOPECKS)
      : order.outSum;
  const password =
    options.badSignature === true ? payment.webhookSecret + WRONG_PASSWORD_SUFFIX : payment.webhookSecret;

  const signature = hashSignature(
    buildResultSignatureSource({ outSum, invId: order.invId, password, shp: order.shp }),
    payment.hashAlgorithm,
  );

  return {
    OutSum: outSum,
    InvId: order.invId,
    // Robokassa отдаёт hex в верхнем регистре — провайдер обязан это переварить.
    SignatureValue: signature.toUpperCase(),
    IncCurrLabel: EMULATOR_METHODS[options.method].incCurrLabel,
    EMail: EMULATOR_PAYER_EMAIL,
    ...order.shp,
  };
}

/**
 * Параметры возврата на Success URL: `OutSum`, `InvId`, `SignatureValue`
 * (пароль #1), `Culture` и `Shp_*` — формат возврата Robokassa.
 * Статус доната редирект не меняет никогда: «спасибо» опрашивает бэкенд.
 */
export function buildSuccessParams(
  order: ScenarioOrder,
  payment: PaymentConfig,
): Readonly<Record<string, string>> {
  const signature = hashSignature(
    buildResultSignatureSource({
      outSum: order.outSum,
      invId: order.invId,
      password: payment.secretKey,
      shp: order.shp,
    }),
    payment.hashAlgorithm,
  );

  return {
    OutSum: order.outSum,
    InvId: order.invId,
    SignatureValue: signature.toUpperCase(),
    Culture: ROBOKASSA_CULTURE,
    ...order.shp,
  };
}
