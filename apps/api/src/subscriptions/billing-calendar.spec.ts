import { SubscriptionStatus } from '../generated/prisma/enums';
import {
  ChargeTimeFormatError,
  MAX_FAILED_CHARGES,
  addMonthsClamped,
  chargeMoment,
  localDateOf,
  nextCycleAfter,
  retryAt,
  toDbDate,
} from './billing-calendar';
import { canTransitionSubscription } from './subscription-status';

const UFA = 'Asia/Yekaterinburg';

describe('календарь автосписаний', () => {
  test('31 января + 1 месяц — 28 февраля в обычный год и 29-е в високосный', () => {
    expect(addMonthsClamped({ year: 2027, month: 0, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 28 });
    expect(addMonthsClamped({ year: 2028, month: 0, day: 31 }, 1)).toEqual({ year: 2028, month: 1, day: 29 });
  });

  test('после февраля подписка от 31-го возвращается на 31-е, а не остаётся на 28-м', () => {
    // Arrange
    const anchor = toDbDate({ year: 2027, month: 0, day: 31 });

    // Act
    const february = chargeMoment({ anchorDate: anchor, cycleNo: 1, chargeTime: '12:00', timeZone: UFA });
    const march = chargeMoment({ anchorDate: anchor, cycleNo: 2, chargeTime: '12:00', timeZone: UFA });

    // Assert: 12:00 в Уфе — 07:00 UTC
    expect(february.toISOString()).toBe('2027-02-28T07:00:00.000Z');
    expect(march.toISOString()).toBe('2027-03-31T07:00:00.000Z');
  });

  test('переход через год: декабрь + 1 = январь следующего года', () => {
    expect(addMonthsClamped({ year: 2026, month: 11, day: 15 }, 1)).toEqual({ year: 2027, month: 0, day: 15 });
  });

  test('локальная дата якоря берётся в зоне жертвователя, а не в UTC', () => {
    // 23:30 UTC 31 октября — в Уфе уже 1 ноября
    expect(localDateOf(new Date('2026-10-31T23:30:00Z'), UFA)).toEqual({ year: 2026, month: 10, day: 1 });
  });

  test('после паузы пропущенные месяцы не списываются задним числом', () => {
    // Arrange: якорь 10 января, сейчас 20 апреля
    const anchor = toDbDate({ year: 2027, month: 0, day: 10 });

    // Act
    const cycle = nextCycleAfter(
      { anchorDate: anchor, chargeTime: '12:00', timeZone: UFA, fromCycle: 1 },
      new Date('2027-04-20T00:00:00Z'),
    );

    // Assert: следующее — 10 мая, это 4-й цикл
    expect(cycle).toBe(4);
  });

  test('повторы после отказа: через сутки, через трое, затем остановка', () => {
    const now = new Date('2027-01-01T00:00:00Z');

    expect(retryAt(1, now)?.toISOString()).toBe('2027-01-02T00:00:00.000Z');
    expect(retryAt(2, now)?.toISOString()).toBe('2027-01-04T00:00:00.000Z');
    expect(retryAt(MAX_FAILED_CHARGES, now)).toBeNull();
  });

  test('время списания не в формате HH:mm — ошибка, а не полночь по умолчанию', () => {
    expect(() =>
      chargeMoment({ anchorDate: toDbDate({ year: 2027, month: 0, day: 1 }), cycleNo: 1, chargeTime: '25:00', timeZone: UFA }),
    ).toThrow(ChargeTimeFormatError);
  });
});

describe('переходы статуса подписки', () => {
  test.each([
    [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, true],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED, true],
    [SubscriptionStatus.PAUSED, SubscriptionStatus.ACTIVE, true],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.FAILED, true],
    [SubscriptionStatus.FAILED, SubscriptionStatus.CANCELLED, true],
    [SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE, false],
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING, false],
    [SubscriptionStatus.FAILED, SubscriptionStatus.ACTIVE, false],
    [SubscriptionStatus.PENDING, SubscriptionStatus.PAUSED, false],
  ])('%s → %s: %s', (from, to, expected) => {
    expect(canTransitionSubscription(from, to)).toBe(expected);
  });
});
