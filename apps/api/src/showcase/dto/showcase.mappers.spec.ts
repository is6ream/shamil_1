import { RegionType } from '../../generated/prisma/enums';
import {
  formatTakenAtLabel,
  toCampaignResponse,
  toDonorRankRowResponse,
  toFeedItemResponse,
  toGalleryItemResponse,
  toMonthlyGoalResponse,
  toRegionRankRowResponse,
  toRegionResponse,
} from './showcase.mappers';

describe('мапперы витрины', () => {
  describe('toCampaignResponse', () => {
    test('без строки счётчиков отдаёт нули и null, а не падает', () => {
      // Act
      const response = toCampaignResponse({ goalKopecks: 24_000_000_000n }, null, null);

      // Assert
      expect(response).toEqual({
        goalKopecks: '24000000000',
        collectedKopecks: '0',
        donationsCount: 0,
        lastPaidAt: null,
        monthlyGoal: null,
        monthlyDonorsCount: null,
      });
    });

    test('суммы уходят строками, дата — ISO', () => {
      // Act
      const response = toCampaignResponse(
        { goalKopecks: 100n },
        { paidTotalKopecks: 9_007_199_254_740_993n, paidCount: 3, lastPaidAt: new Date('2026-09-21T11:27:00Z') },
        null,
      );

      // Assert — число больше MAX_SAFE_INTEGER не теряет точности по дороге
      expect(response.collectedKopecks).toBe('9007199254740993');
      expect(response.lastPaidAt).toBe('2026-09-21T11:27:00.000Z');
    });
  });

  test('цель месяца: границы — начало первого и конец последнего дня по Москве', () => {
    // Act
    const goal = toMonthlyGoalResponse({
      goalKopecks: 500_000_000n,
      collectedKopecks: 10_000n,
      periodStart: new Date(Date.UTC(2026, 8, 1)),
      periodEnd: new Date(Date.UTC(2026, 8, 30)),
    });

    // Assert
    expect(goal).toEqual({
      goalKopecks: '500000000',
      collectedKopecks: '10000',
      periodStart: '2026-08-31T21:00:00.000Z',
      periodEnd: '2026-09-30T20:59:59.999Z',
    });
  });

  test('у страны код региона — код страны', () => {
    // Act
    const country = toRegionResponse({
      slug: 'kz',
      code: null,
      countryCode: 'KZ',
      name: 'Казахстан',
      type: RegionType.country,
      flagUrl: null,
    });

    // Assert
    expect(country.code).toBe('KZ');
    expect(country).not.toHaveProperty('countryCode');
  });

  test('строка рейтинга: число платежей и сумма строкой', () => {
    // Act
    const row = toRegionRankRowResponse({
      paidTotalKopecks: 73_589_000n,
      paidCount: 412,
      region: { slug: '02', name: 'Республика Башкортостан', flagUrl: null },
    });

    // Assert
    expect(row).toEqual({
      slug: '02',
      name: 'Республика Башкортостан',
      flagUrl: null,
      donorsCount: 412,
      paidTotalKopecks: '73589000',
    });
  });

  test('строка топа донатеров', () => {
    expect(toDonorRankRowResponse({ donorName: 'Наиль Х.', paidAmountKopecks: 5_000_000n })).toEqual({
      donorName: 'Наиль Х.',
      paidAmountKopecks: '5000000',
    });
  });

  describe('toFeedItemResponse', () => {
    const base = {
      id: 'e2f1a6d4-0000-4000-8000-000000000001',
      paidAt: new Date('2026-09-21T11:32:00Z'),
      paidAmountKopecks: 10_000n,
      method: 'sbp',
      region: { name: 'Республика Башкортостан' },
    };

    test('у анонимного доната подписи нет, даже если она оказалась в строке', () => {
      // Act
      const item = toFeedItemResponse({ ...base, isAnonymous: true, donorName: 'Утечка' });

      // Assert
      expect(item.donorName).toBeNull();
    });

    test('ключи ответа — только публичные поля', () => {
      // Act
      const item = toFeedItemResponse({ ...base, isAnonymous: false, donorName: 'Айгуль' });

      // Assert
      expect(Object.keys(item).sort()).toEqual(
        ['amountKopecks', 'donorName', 'id', 'method', 'paidAt', 'regionName'].sort(),
      );
      expect(item.amountKopecks).toBe('10000');
      expect(item.regionName).toBe('Республика Башкортостан');
    });

    test('донат без региона', () => {
      expect(toFeedItemResponse({ ...base, region: null, isAnonymous: true, donorName: null }).regionName).toBeNull();
    });
  });

  describe('formatTakenAtLabel', () => {
    test.each([
      [new Date(Date.UTC(2026, 5, 1)), 'июнь 2026'],
      [new Date(Date.UTC(2026, 4, 31)), 'май 2026'],
      [new Date(Date.UTC(2025, 0, 1)), 'январь 2025'],
      [new Date(Date.UTC(2026, 11, 31)), 'декабрь 2026'],
    ])('%s → «%s» — именительный падеж, без «г.»', (date, label) => {
      expect(formatTakenAtLabel(date)).toBe(label);
    });

    test('без даты съёмки — пустая строка', () => {
      expect(formatTakenAtLabel(null)).toBe('');
    });
  });

  describe('toGalleryItemResponse', () => {
    const row = {
      id: 'g1',
      imageUrl: '/uploads/2026-06-foundation.webp',
      takenOn: new Date(Date.UTC(2026, 5, 10)),
    };

    test('подпись — caption, затем alt, затем пустая строка', () => {
      expect(toGalleryItemResponse({ ...row, caption: 'Заливка фундамента', altText: 'alt' }).caption).toBe(
        'Заливка фундамента',
      );
      expect(toGalleryItemResponse({ ...row, caption: null, altText: 'Опалубка' }).caption).toBe('Опалубка');
      expect(toGalleryItemResponse({ ...row, caption: null, altText: null }).caption).toBe('');
    });

    test('url и подпись даты', () => {
      expect(toGalleryItemResponse({ ...row, caption: null, altText: null })).toMatchObject({
        url: '/uploads/2026-06-foundation.webp',
        takenAtLabel: 'июнь 2026',
      });
    });
  });
});
