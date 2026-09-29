import { moscowDayEnd, moscowDayStart, moscowToday } from './moscow-date';

describe('дата по Москве', () => {
  test('в 01:00 МСК первого числа по Москве уже новый месяц, хотя в UTC ещё старый', () => {
    // Arrange — 2026-10-01 01:00 МСК = 2026-09-30 22:00 UTC
    const now = new Date('2026-09-30T22:00:00Z');

    // Act & Assert
    expect(moscowToday(now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  test('днём даты совпадают', () => {
    expect(moscowToday(new Date('2026-09-15T09:00:00Z')).toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  test('границы дня: 00:00 и 23:59:59.999 по Москве', () => {
    // Arrange
    const day = new Date(Date.UTC(2026, 8, 30));

    // Act & Assert
    expect(moscowDayStart(day).toISOString()).toBe('2026-09-29T21:00:00.000Z');
    expect(moscowDayEnd(day).toISOString()).toBe('2026-09-30T20:59:59.999Z');
  });
});
