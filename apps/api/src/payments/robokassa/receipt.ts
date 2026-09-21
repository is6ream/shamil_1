import type { ReceiptConfig } from '../../config/configuration';

/**
 * Фискальный чек (54-ФЗ) для параметра `Receipt`.
 *
 * ⚠ НЕ ПРОВЕРЕНО НА ЖИВОМ МЕРЧАНТЕ. Фискализация у заказчика не подтверждена
 * (открытый вопрос docs/payments-setup.md, шаг 5), и включается она только
 * явным `PAYMENT_RECEIPT_ENABLED=true` с тремя обязательными полями.
 * До первого успешного платежа в тестовом режиме считать этот состав чека
 * гипотезой: `payment_method` и `payment_object` для пожертвования нужно
 * подтвердить поддержкой Robokassa.
 *
 * Что проверено по документации (docs.robokassa.ru, «Фискализация»):
 * значение `Receipt` перед добавлением в строку подписи URL-кодируется —
 * дословно «Перед добавлением в строку для подписи значение Receipt нужно
 * URL-кодировать». Это единственное место, где документация расходится
 * со страницей «Интерфейс оплаты», и приоритет у специальной страницы.
 */

export class ReceiptConfigError extends Error {
  constructor(missing: string) {
    super(`Фискализация включена, но не задано: ${missing}`);
    this.name = 'ReceiptConfigError';
  }
}

export interface ReceiptInput {
  /** Сумма позиции в том же виде, что и OutSum: «100.00». */
  readonly outSum: string;
  readonly config: ReceiptConfig;
}

/**
 * JSON собирается строкой, а не через `JSON.stringify` объекта, ровно из-за
 * поля `sum`: оно обязано быть числом, а `JSON.stringify(100.00)` даёт `100`
 * и вообще проводит сумму через double. Здесь `outSum` — уже готовый
 * десятичный литерал, посчитанный из копеек целочисленно.
 * Текстовые поля при этом экранируются штатным `JSON.stringify`.
 */
export function buildReceiptJson({ outSum, config }: ReceiptInput): string {
  if (config.taxationSystem === undefined) {
    throw new ReceiptConfigError('PAYMENT_RECEIPT_SNO');
  }

  if (config.itemName === undefined || config.itemName.length === 0) {
    throw new ReceiptConfigError('PAYMENT_RECEIPT_ITEM_NAME');
  }

  if (config.vat === undefined) {
    throw new ReceiptConfigError('PAYMENT_RECEIPT_VAT');
  }

  const name = JSON.stringify(config.itemName);
  const sno = JSON.stringify(config.taxationSystem);
  const tax = JSON.stringify(config.vat);

  return (
    `{"sno":${sno},"items":[{"name":${name},"quantity":1,"sum":${outSum},` +
    `"payment_method":"full_payment","payment_object":"payment","tax":${tax}}]}`
  );
}
