import { ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../bootstrap';
import { ClaimLegacyDto, RecurringCheckoutDto, RequestEmailCodeDto } from './dto';

describe('recurring v1 boundary', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  it('trims email before HTTP validation without coercing non-string input', async () => {
    const metadata = { type: 'body' as const, metatype: RequestEmailCodeDto };
    await expect(pipe.transform({ email: '  Donor+tag@example.test  ' }, metadata))
      .resolves.toMatchObject({ email: 'Donor+tag@example.test' });
    for (const email of [123, true, {}, null]) {
      await expect(pipe.transform({ email }, metadata)).rejects.toMatchObject({ status: 400 });
    }
  });
  const body = {
    amountKopecks: 10000, frequency: 'monthly', method: 'card', accepted: true,
    version: 'synthetic-test-only', previewDate: '2026-12-14',
  };
  const validate = (data: Record<string, unknown>) =>
    pipe.transform(data, { type: 'body', metatype: RecurringCheckoutDto });

  it.each([false, undefined, null, 'true', 'false', 1, 0, {}, []])('rejects non-literal consent %p', async accepted => {
    await expect(validate({ ...body, accepted })).rejects.toMatchObject({ status: 400 });
  });
  it.each(['10000', 1000.5, -1000, 0, Number.MAX_SAFE_INTEGER])('rejects unsafe money %p', async amountKopecks => {
    await expect(validate({ ...body, amountKopecks })).rejects.toMatchObject({ status: 400 });
  });
  it.each(['ownerId', 'email', 'key', 'recurring'])('rejects identity/legacy injection %s', async field => {
    await expect(validate({ ...body, [field]: 'untrusted' })).rejects.toMatchObject({ status: 400 });
  });
  it.each(['daily', 'every_friday', 'monthly'])('accepts supported schedule %s', async frequency => {
    await expect(validate({ ...body, frequency })).resolves.toMatchObject({ frequency, accepted: true, amountKopecks: 10000 });
  });
  it('rejects a UUID as legacy ownership proof', async () => {
    await expect(pipe.transform({ legacyKey: '40ae4511-c478-49ce-a70b-c270ebf7d4a2' },
      { type: 'body', metatype: ClaimLegacyDto })).rejects.toMatchObject({ status: 400 });
  });
});
