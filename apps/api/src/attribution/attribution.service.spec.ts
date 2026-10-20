import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { AttributionService, EMPTY_ATTRIBUTION } from './attribution.service';

const SITE_URL = 'https://mechetshamil.ru';
const NOW = new Date('2026-10-19T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function createService(siteUrl = SITE_URL): AttributionService {
  return new AttributionService(
    new ConfigService<AppConfig, true>({ publicUrls: { siteUrl, apiUrl: 'https://api.mechetshamil.ru' } }),
  );
}

describe('AttributionService.classify — источник по Referer', () => {
  const service = createService();

  test.each([
    ['https://t.me/', 'telegram', 'referral'],
    ['https://web.telegram.org/k/', 'telegram', 'referral'],
    ['https://l.instagram.com/?u=x', 'instagram', 'referral'],
    ['https://www.instagram.com/', 'instagram', 'referral'],
    ['https://wa.me/', 'whatsapp', 'referral'],
    ['https://away.vk.com/away.php', 'vk', 'referral'],
    ['https://yandex.ru/', 'yandex', 'organic'],
    ['https://yandex.kz/search/', 'yandex', 'organic'],
    ['https://ya.ru/', 'yandex', 'organic'],
    ['https://www.google.com/', 'google', 'organic'],
    ['https://www.google.com.kg/', 'google', 'organic'],
    ['https://www.islam-today.ru/news/1', 'islam-today.ru', 'referral'],
  ])('%s → %s / %s', (referrer, source, medium) => {
    // Act
    const result = service.classify(referrer);

    // Assert
    expect(result).toEqual({ source, medium });
  });

  test.each([
    ['пустой Referer', null],
    ['пустая строка', ''],
    ['битый адрес', 'not a url'],
    ['не http(s)', 'ftp://t.me/file'],
    ['свой сайт', 'https://mechetshamil.ru/02/'],
    ['свой сайт с www', 'https://www.mechetshamil.ru/'],
  ])('%s → direct / none', (_case, referrer) => {
    // Act
    const result = service.classify(referrer);

    // Assert
    expect(result).toEqual({ source: 'direct', medium: 'none' });
  });

  test('похожий на мессенджер домен не считается мессенджером', () => {
    // Act
    const result = service.classify('https://not-t.me/');

    // Assert
    expect(result).toEqual({ source: 'not-t.me', medium: 'referral' });
  });
});

describe('AttributionService.resolve', () => {
  const service = createService();

  test('без атрибуции — все колонки пусты: это строка «без атрибуции», а не прямой заход', () => {
    // Act
    const result = service.resolve({}, NOW);

    // Assert
    expect(result).toEqual(EMPTY_ATTRIBUTION);
  });

  test('метки нормализуются: края обрезаны, регистр нижний, пустая метка — null', () => {
    // Act
    const result = service.resolve(
      { attribution: { first: { source: ' Telegram ', medium: 'Social', campaign: 'Рамадан-2026', content: '   ' } } },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({
      utmSource: 'telegram',
      utmMedium: 'social',
      utmCampaign: 'рамадан-2026',
      utmContent: null,
      utmTerm: null,
    });
  });

  test('явные метки приоритетнее Referer', () => {
    // Act
    const result = service.resolve(
      { attribution: { first: { source: 'banner', medium: 'offline' }, referrer: 'https://t.me/' } },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({ utmSource: 'banner', utmMedium: 'offline', referrer: 'https://t.me/' });
  });

  test('без utm_source источник и канал берутся по Referer, остальные метки сохраняются', () => {
    // Act
    const result = service.resolve(
      { attribution: { first: { campaign: 'ramadan' }, referrer: 'https://l.instagram.com/', landingPage: '/' } },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({
      utmSource: 'instagram',
      utmMedium: 'referral',
      utmCampaign: 'ramadan',
      landingPage: '/',
    });
  });

  test('явный medium без source не перетирается классификацией', () => {
    // Act
    const result = service.resolve({ attribution: { first: { medium: 'cpc' }, referrer: 'https://yandex.ru/' } }, NOW);

    // Assert
    expect(result).toMatchObject({ utmSource: 'yandex', utmMedium: 'cpc' });
  });

  test('cookie есть, но ни меток, ни Referer — прямой заход', () => {
    // Act
    const result = service.resolve({ attribution: { landingPage: '/02/' } }, NOW);

    // Assert
    expect(result).toMatchObject({ utmSource: 'direct', utmMedium: 'none', landingPage: '/02/' });
  });

  test('last-touch с источником пишется отдельно от first-touch', () => {
    // Act
    const result = service.resolve(
      {
        attribution: {
          first: { source: 'telegram', medium: 'social' },
          last: { source: 'Instagram', medium: 'stories', campaign: 'oct' },
        },
      },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({
      utmSource: 'telegram',
      utmMedium: 'social',
      lastUtmSource: 'instagram',
      lastUtmMedium: 'stories',
      lastUtmCampaign: 'oct',
    });
  });

  test('без last-touch с источником last равен first, включая источник по Referer', () => {
    // Act
    const result = service.resolve(
      { attribution: { last: { campaign: 'only-campaign' }, referrer: 'https://t.me/' } },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({
      utmSource: 'telegram',
      utmMedium: 'referral',
      lastUtmSource: 'telegram',
      lastUtmMedium: 'referral',
      lastUtmCampaign: null,
    });
  });

  test('старое поле utm принимается как first-touch', () => {
    // Act
    const result = service.resolve(
      { utm: { source: 'VK', campaign: 'x', referrer: 'https://vk.com/', landingPage: '/?utm_source=VK' } },
      NOW,
    );

    // Assert
    expect(result).toMatchObject({
      utmSource: 'vk',
      utmCampaign: 'x',
      referrer: 'https://vk.com/',
      landingPage: '/?utm_source=VK',
      lastUtmSource: 'vk',
    });
  });

  test('utm и attribution вместе — 400: непонятно, чему верить', () => {
    // Act
    const act = (): unknown => service.resolve({ utm: { source: 'a' }, attribution: { first: { source: 'b' } } }, NOW);

    // Assert
    expect(act).toThrow(BadRequestException);
  });

  describe('время первого захода', () => {
    function firstTouchAt(value: string): Date | null {
      return service.resolve({ attribution: { firstTouchAt: value } }, NOW).firstTouchAt;
    }

    test('время в окне атрибуции сохраняется', () => {
      // Arrange
      const tenDaysAgo = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();

      // Act & Assert
      expect(firstTouchAt(tenDaysAgo)?.toISOString()).toBe(tenDaysAgo);
    });

    test('небольшое расхождение часов в будущее допускается', () => {
      // Arrange
      const inTwoMinutes = new Date(NOW.getTime() + 2 * 60 * 1000).toISOString();

      // Act & Assert
      expect(firstTouchAt(inTwoMinutes)).not.toBeNull();
    });

    test.each([
      ['из будущего', new Date(NOW.getTime() + DAY_MS).toISOString()],
      ['старше окна атрибуции', new Date(NOW.getTime() - 120 * DAY_MS).toISOString()],
    ])('%s — не пишется', (_case, value) => {
      // Act & Assert
      expect(firstTouchAt(value)).toBeNull();
    });
  });
});
