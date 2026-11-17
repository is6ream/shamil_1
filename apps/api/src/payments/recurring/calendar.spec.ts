import { chargeAt, localDate, nextDate, periodKey } from './calendar';

describe('recurring calendar', () => {
  it.each([
    ['2026-11-03', '2026-11-06'],
    ['2026-11-02', '2026-11-06'],
    ['2026-11-06', '2026-11-13'],
  ])('finds the Friday strictly after %s', (first, expected) => {
    expect(nextDate(first, 'every_friday', 1)).toBe(expected);
  });

  it('changes the daily window at Moscow midnight', () => {
    const date = localDate(new Date('2026-11-03T21:05:00Z'));
    expect(nextDate(date, 'daily', 4)).toBe('2026-11-05');
    expect(chargeAt('2026-11-05').toISOString()).toBe('2026-11-05T07:00:00.000Z');
  });

  it('clamps February and preserves the monthly anchor', () => {
    const february = nextDate('2027-01-31', 'monthly', 31);
    expect(february).toBe('2027-02-28');
    expect(nextDate(february, 'monthly', 31)).toBe('2027-03-31');
    expect(nextDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29');
    expect(periodKey(february, 'monthly')).toBe('2027-02');
  });

  it('runs monthly on the same agreed day when it exists', () => {
    expect(nextDate('2026-12-13', 'monthly', 13)).toBe('2027-01-13');
  });
});
