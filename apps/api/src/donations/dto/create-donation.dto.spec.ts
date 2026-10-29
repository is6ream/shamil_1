import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import { VALIDATION_PIPE_OPTIONS } from '../../bootstrap';
import { CreateDonationDto } from './create-donation.dto';

/**
 * Тело `POST /donations` через тот же пайп, что стоит в приложении.
 *
 * Пожертвования только разовые. Старый клиент, присылающий периодичность,
 * обязан получить 400: молча выбросить поле значило бы, что человек думает,
 * будто оформил ежемесячный взнос, а списание прошло один раз.
 */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
const metadata: ArgumentMetadata = { type: 'body', metatype: CreateDonationDto };

function transform(body: Record<string, unknown>): Promise<unknown> {
  return pipe.transform(body, metadata);
}

const VALID_BODY = { amountKopecks: 10_000, channel: 'online' } as const;

describe('тело создания доната', () => {
  test('разовое пожертвование без периодичности проходит', async () => {
    // Act
    const dto = await transform({ ...VALID_BODY });

    // Assert
    expect(dto).toBeInstanceOf(CreateDonationDto);
  });

  test.each([
    ['recurrence', 'monthly'],
    ['frequency', 'weekly'],
    ['period', 'day'],
  ])('поле периодичности «%s» отклоняется с 400', async (key, value) => {
    // Act & Assert
    await expect(transform({ ...VALID_BODY, [key]: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('UTM-атрибуция в теле доната', () => {
  test('корректные метки, Referer и страница входа проходят', async () => {
    // Act
    const dto = await transform({
      ...VALID_BODY,
      utm: {
        source: 'vk',
        medium: 'cpc',
        campaign: 'рамадан 2026',
        content: 'banner_1',
        term: 'мечеть+уфа',
        referrer: 'https://vk.com/feed',
        landingPage: '/02/?utm_source=vk',
      },
    });

    // Assert
    expect(dto).toBeInstanceOf(CreateDonationDto);
  });

  test.each([
    ['source', '<script>'],
    ['campaign', 'x'.repeat(129)],
    ['medium', 'a"b'],
    ['referrer', 'javascript:alert(1)'],
    ['landingPage', 'https://evil.example/'],
    ['landingPage', '/путь с пробелом'],
  ])('недопустимое значение %s отклоняется с 400', async (key, value) => {
    // Act & Assert
    await expect(transform({ ...VALID_BODY, utm: { [key]: value } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('лишнее поле внутри utm отклоняется: список меток закрыт', async () => {
    // Act & Assert
    await expect(
      transform({ ...VALID_BODY, utm: { source: 'vk', gclid: 'abc' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('utm не объект — 400', async () => {
    // Act & Assert
    await expect(transform({ ...VALID_BODY, utm: 'vk' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('атрибуция first/last в теле доната', () => {
  test('метки нормализуются ещё в DTO: края обрезаны, регистр нижний', async () => {
    // Act
    const dto = (await transform({
      ...VALID_BODY,
      attribution: {
        first: { source: ' Telegram ', medium: 'Social', campaign: 'Рамадан 2026' },
        last: { source: 'INSTAGRAM' },
        referrer: 'https://t.me/',
        landingPage: '/02/',
        firstTouchAt: '2026-10-01T10:00:00.000Z',
      },
    })) as CreateDonationDto;

    // Assert
    expect(dto.attribution?.first).toMatchObject({ source: 'telegram', medium: 'social', campaign: 'рамадан 2026' });
    expect(dto.attribution?.last).toMatchObject({ source: 'instagram' });
  });

  test.each([
    ['first', { source: '<script>' }],
    ['first', { source: 'mail@example.com' }],
    ['last', { campaign: 'x'.repeat(129) }],
    ['first', { gclid: 'abc' }],
  ])('недопустимая метка в %s — 400', async (touch, value) => {
    // Act & Assert
    await expect(
      transform({ ...VALID_BODY, attribution: { [touch]: value } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test.each([
    ['referrer', 'javascript:alert(1)'],
    ['landingPage', 'https://evil.example/'],
    ['firstTouchAt', 'вчера'],
    ['sourceGuess', 'telegram'],
  ])('недопустимое поле атрибуции %s — 400', async (key, value) => {
    // Act & Assert
    await expect(
      transform({ ...VALID_BODY, attribution: { [key]: value } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test.each(['telegram', 'banner_qr', 'other'])('howDidYouHear=%s проходит', async (value) => {
    // Act
    const dto = await transform({ ...VALID_BODY, channel: 'transfer', howDidYouHear: value });

    // Assert
    expect(dto).toMatchObject({ howDidYouHear: value });
  });

  test('howDidYouHear вне списка — 400', async () => {
    // Act & Assert
    await expect(
      transform({ ...VALID_BODY, howDidYouHear: 'tv' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
