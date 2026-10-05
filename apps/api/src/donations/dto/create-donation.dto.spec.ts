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
