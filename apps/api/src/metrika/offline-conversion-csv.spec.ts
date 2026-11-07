import {
  buildOfflineConversionsCsv,
  escapeCsvField,
  kopecksToRubles,
  toUnixSeconds,
} from './offline-conversion-csv';
import type { ConversionRow } from './offline-conversion-csv';

const PAID_AT = new Date('2026-10-20T09:30:15.987Z');
const PAID_AT_UNIX = '1792488615';

function row(overrides: Partial<ConversionRow> = {}): ConversionRow {
  return {
    identifier: '1729000000123456789',
    target: 'donation_paid',
    conversionAt: PAID_AT,
    price: '100.00',
    currency: 'RUB',
    ...overrides,
  };
}

describe('CSV офлайн-конверсий', () => {
  test('заголовок ClientId и колонки в порядке Target, DateTime, Price, Currency', () => {
    // Act
    const csv = buildOfflineConversionsCsv('CLIENT_ID', [row()]);

    // Assert
    expect(csv).toBe(
      `ClientId,Target,DateTime,Price,Currency\n1729000000123456789,donation_paid,${PAID_AT_UNIX},100.00,RUB\n`,
    );
  });

  test('файл yclid — с колонкой Yclid', () => {
    // Act
    const csv = buildOfflineConversionsCsv('YCLID', [row({ identifier: '5207465128348827647' })]);

    // Assert
    expect(csv?.split('\n')[0]).toBe('Yclid,Target,DateTime,Price,Currency');
    expect(csv).toContain('5207465128348827647,donation_paid,');
  });

  test('пустая пачка — null: пустой файл Метрика не примет', () => {
    expect(buildOfflineConversionsCsv('CLIENT_ID', [])).toBeNull();
  });

  test('DateTime — Unix-время в секундах, миллисекунды отброшены', () => {
    expect(toUnixSeconds(PAID_AT)).toBe(PAID_AT_UNIX);
    expect(toUnixSeconds(new Date(0))).toBe('0');
  });

  test.each([
    [10_000n, '100.00'],
    [10_050n, '100.50'],
    [1n, '0.01'],
    [0n, '0.00'],
    [24_000_000_000n, '240000000.00'],
    [-150n, '-1.50'],
  ])('цена %p коп. → %p: разделитель — точка, без double', (kopecks, expected) => {
    expect(kopecksToRubles(kopecks)).toBe(expected);
  });

  test.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['кириллица', 'кириллица'],
  ])('экранирование %p → %p', (value, expected) => {
    expect(escapeCsvField(value)).toBe(expected);
  });

  test('UTF-8: кириллица проходит как есть и экранируется по RFC 4180', () => {
    // Act
    const csv = buildOfflineConversionsCsv('CLIENT_ID', [row({ target: 'цель,1' })]);

    // Assert
    expect(csv).toContain(',"цель,1",');
    expect(Buffer.from(csv ?? '', 'utf8').toString('utf8')).toBe(csv);
  });
});
