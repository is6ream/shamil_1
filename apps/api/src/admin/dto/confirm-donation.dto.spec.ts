import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ConfirmDonationDto } from './confirm-donation.dto';

/**
 * Валидация тела подтверждения. Сумма приходит строкой намеренно: деньги
 * в проекте — BigInt, и число в JSON провело бы их через double.
 *
 * Опции трансформации повторяют боевой `ValidationPipe` из `main.ts`.
 * Это не формальность: `enableImplicitConversion` приводит присланное число
 * к строке до валидации, и проверять DTO без него значило бы проверять не то,
 * что работает на проде.
 */
function validate(raw: Record<string, unknown>): readonly string[] {
  const dto = plainToInstance(ConfirmDonationDto, raw, { enableImplicitConversion: true });

  return validateSync(dto).map((error) => error.property);
}

describe('тело админского подтверждения', () => {
  test('пустое тело допустимо: обычный случай — сумма заказа', () => {
    // Act & Assert
    expect(validate({})).toHaveLength(0);
  });

  test('сумма копеек строкой проходит', () => {
    // Act & Assert
    expect(validate({ amountKopecks: '150000', method: 'cash' })).toHaveLength(0);
  });

  test('целое число копеек тоже проходит — боевой пайп приводит его к строке', () => {
    // Arrange: набор допустимых значений от этого не расширяется — всё, что
    // не целое число в пределах потолка, отсекает та же регулярка
    expect(validate({ amountKopecks: 150_000 })).toHaveLength(0);
  });

  test('рубли с копейками не принимаются ни строкой, ни числом', () => {
    // Arrange: 1500.50 — это double, и на сумме сбора он даёт расхождение
    // с выпиской; в поле ожидаются копейки целым числом
    expect(validate({ amountKopecks: '1500.50' })).toContain('amountKopecks');
    expect(validate({ amountKopecks: 1500.5 })).toContain('amountKopecks');
  });

  test('ноль, минус и пробелы не принимаются', () => {
    // Act & Assert
    expect(validate({ amountKopecks: '0' })).toContain('amountKopecks');
    expect(validate({ amountKopecks: '-100' })).toContain('amountKopecks');
    expect(validate({ amountKopecks: '10 000' })).toContain('amountKopecks');
  });

  test('абсурдно крупное число отсекается длиной, а не молча теряет точность', () => {
    // Arrange: 1e21 сериализуется как '1e+21' и до BigInt не доходит;
    // 14 знаков — длиннее потолка подтверждения, и это тоже отказ
    expect(validate({ amountKopecks: 1e21 })).toContain('amountKopecks');
    expect(validate({ amountKopecks: '10000000000000' })).toContain('amountKopecks');
  });

  test('произвольный способ оплаты не принимается', () => {
    // Act & Assert
    expect(validate({ method: 'крипта' })).toContain('method');
  });
});
