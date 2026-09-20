import { DonationStatus } from '../generated/prisma/enums';
import {
  DonationStatusTransitionError,
  assertTransition,
  canTransition,
  isEffectiveTransition,
} from './donation-status';

describe('переходы статуса доната', () => {
  test('pending → paid разрешён: обычный успешный платёж', () => {
    // Act
    const result = canTransition(DonationStatus.pending, DonationStatus.paid);

    // Assert
    expect(result).toBe(true);
  });

  test('pending → failed разрешён: провайдер сообщил об отказе', () => {
    expect(canTransition(DonationStatus.pending, DonationStatus.failed)).toBe(true);
  });

  test('failed → paid разрешён: успешный колбэк пришёл после отказного', () => {
    expect(canTransition(DonationStatus.failed, DonationStatus.paid)).toBe(true);
  });

  test('paid → pending запрещён: оплаченный донат не возвращается в ожидание', () => {
    expect(canTransition(DonationStatus.paid, DonationStatus.pending)).toBe(false);
  });

  test('paid → failed запрещён: paid финален', () => {
    expect(canTransition(DonationStatus.paid, DonationStatus.failed)).toBe(false);
  });

  test('failed → pending запрещён: назад в ожидание пути нет', () => {
    expect(canTransition(DonationStatus.failed, DonationStatus.pending)).toBe(false);
  });

  test('повтор того же статуса разрешён — это ретрай вебхука, а не ошибка', () => {
    expect(canTransition(DonationStatus.paid, DonationStatus.paid)).toBe(true);
    expect(canTransition(DonationStatus.pending, DonationStatus.pending)).toBe(true);
  });

  test('повтор того же статуса ничего не меняет — записи в БД не требует', () => {
    // Arrange / Act / Assert
    expect(isEffectiveTransition(DonationStatus.paid, DonationStatus.paid)).toBe(false);
    expect(isEffectiveTransition(DonationStatus.pending, DonationStatus.paid)).toBe(true);
  });

  test('assertTransition молчит на разрешённом переходе', () => {
    expect(() => {
      assertTransition(DonationStatus.pending, DonationStatus.paid);
    }).not.toThrow();
  });

  test('assertTransition падает понятной ошибкой на запрещённом', () => {
    // Act
    const act = (): void => {
      assertTransition(DonationStatus.paid, DonationStatus.pending);
    };

    // Assert
    expect(act).toThrow(DonationStatusTransitionError);
    expect(act).toThrow('Переход доната "paid" → "pending" запрещён');
  });
});
