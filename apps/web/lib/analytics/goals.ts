/**
 * Цели Яндекс Метрики (JS-события). Список с местами срабатывания —
 * `docs/metrika/GOALS.md`; в Метрике цели — «JavaScript-событие», условие «совпадает».
 *
 * `donation_paid` здесь нет намеренно: факт оплаты отправляет только сервер
 * офлайн-конверсией. Клиентская цель с суммой задвоила бы деньги в отчётах
 * и подделывалась бы из консоли браузера. Тип `MetrikaGoal` не даёт
 * отправить её с клиента даже по ошибке.
 */
export const METRIKA_GOALS = {
  formView: "donate_form_view",
  amountSelect: "donate_amount_select",
  methodSelect: "donate_method_select",
  submit: "donate_submit",
  sbpQrInteraction: "sbp_qr_interaction",
  shareClick: "share_click",
  successView: "donate_success_view",
} as const;

export type MetrikaGoal = (typeof METRIKA_GOALS)[keyof typeof METRIKA_GOALS];

/**
 * Параметры целей — закрытый список ключей без персональных данных.
 * Имя, телефон, e-mail, комментарий в Метрику не уходят: это запрещено её
 * правилами и противоречит 152-ФЗ.
 */
export interface GoalParams {
  /** Сумма в рублях. */
  readonly amount?: number;
  /** Способ оплаты: `sbp`, `card`, `sberpay`, `tpay`, `transfer`. */
  readonly method?: string;
  /** Канал «Поделиться»: `whatsapp`, `telegram`, `vk`, `copy`, `native`. */
  readonly channel?: string;
  /** Что сделали с QR/реквизитами: `open_bank`, `copy`. */
  readonly action?: string;
  /** Блок страницы. */
  readonly block?: string;
}

const STRING_KEYS = ["method", "channel", "action", "block"] as const;

/** Только служебные идентификаторы: ни кириллицы, ни пробелов, ни `@`, ни `+`. */
const TOKEN_PATTERN = /^[a-z0-9_-]{1,32}$/;

const MAX_AMOUNT_RUBLES = 100_000_000;

/**
 * Белый список вместо чёрного: всё, чего нет в `GoalParams`, отбрасывается.
 * Поле с ПДн, добавленное в вызов по ошибке, не дойдёт до Метрики.
 * Пусто — `undefined`, чтобы не слать `{}`.
 */
export function sanitizeGoalParams(params: unknown): GoalParams | undefined {
  if (typeof params !== "object" || params === null) {
    return undefined;
  }

  const source = params as Record<string, unknown>;
  const result: { -readonly [K in keyof GoalParams]: GoalParams[K] } = {};
  const amount = source.amount;

  if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= MAX_AMOUNT_RUBLES) {
    result.amount = amount;
  }

  for (const key of STRING_KEYS) {
    const value = source[key];

    if (typeof value === "string" && TOKEN_PATTERN.test(value)) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
