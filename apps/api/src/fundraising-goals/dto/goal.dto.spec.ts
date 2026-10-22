import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import { VALIDATION_PIPE_OPTIONS } from '../../bootstrap';
import { CreateGoalDto, UpdateGoalDto } from './goal.dto';

/** Тела этапов — через тот же пайп, что стоит в приложении. */
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

function transform<T>(metatype: new () => T, body: Record<string, unknown>): Promise<T> {
  const metadata: ArgumentMetadata = { type: 'body', metatype };

  return pipe.transform(body, metadata) as Promise<T>;
}

const VALID = { title: 'На кирпичи', targetAmountKopecks: '70000000' } as const;

describe('тело создания этапа', () => {
  test('название и описание обрезаются по краям, пустое описание — null', async () => {
    // Act
    const dto = await transform(CreateGoalDto, { ...VALID, title: '  На кирпичи  ', description: '   ' });

    // Assert
    expect(dto).toMatchObject({ title: 'На кирпичи', description: null });
  });

  test.each([
    ['title короче 3 символов после trim', { title: '  аб ' }],
    ['title длиннее 80', { title: 'а'.repeat(81) }],
    ['HTML в названии', { title: '<b>Кирпичи</b>' }],
    ['HTML в описании', { description: 'ок <script>alert(1)</script>' }],
    ['описание длиннее 200', { description: 'а'.repeat(201) }],
    ['дробная сумма числом', { targetAmountKopecks: 700000.5 }],
    ['сумма с дробью', { targetAmountKopecks: '700000.50' }],
    ['отрицательная цель', { targetAmountKopecks: '-100000' }],
    ['дата не ISO', { startsAt: '01.10.2026' }],
    ['корректировка с ведущим нулём', { manualAdjustmentKopecks: '-0100' }],
    ['лишнее поле', { status: 'ACTIVE' }],
  ])('%s — 400', async (_name, override) => {
    await expect(transform(CreateGoalDto, { ...VALID, ...override })).rejects.toBeInstanceOf(BadRequestException);
  });

  test('целое число вместо строки приводится к строке копеек (enableImplicitConversion)', async () => {
    const dto = await transform(CreateGoalDto, { ...VALID, targetAmountKopecks: 70000000 });

    expect(dto.targetAmountKopecks).toBe('70000000');
  });

  test('отрицательная корректировка допустима', async () => {
    const dto = await transform(CreateGoalDto, { ...VALID, manualAdjustmentKopecks: '-150000' });

    expect(dto.manualAdjustmentKopecks).toBe('-150000');
  });
});

describe('тело правки этапа', () => {
  test('endsAt и description можно стереть через null', async () => {
    const dto = await transform(UpdateGoalDto, { endsAt: null, description: null });

    expect(dto).toMatchObject({ endsAt: null, description: null });
  });

  test.each([['title'], ['targetAmountKopecks'], ['startsAt'], ['manualAdjustmentKopecks']])(
    '%s: null — 400, это поле не стирается',
    async (field) => {
      await expect(transform(UpdateGoalDto, { [field]: null })).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
