import { UnauthorizedException } from '@nestjs/common';

import { MANUAL_PROVIDER_CODE, ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import { DonationStatus } from '../generated/prisma/enums';
import { PaymentCallbacksController } from './payment-callbacks.controller';
import type { PaymentProvider } from './payment-provider.interface';
import { PaymentProviderResolver } from './payment-provider.resolver';
import type { ParsedWebhook } from './payment-provider.types';
import type { PaymentsService } from './payments.service';

const PARSED: ParsedWebhook = {
  provider: ROBOKASSA_PROVIDER_CODE,
  providerEventId: '42',
  invoiceNo: 42,
  status: DonationStatus.paid,
  amountKopecks: 10_000n,
  acknowledgement: 'OK42',
};

function stub(code: string, signatureValid: boolean): PaymentProvider {
  return {
    code,
    createPayment: () => Promise.reject(new Error('не используется')),
    verifySignature: () => signatureValid,
    parseWebhook: () => PARSED,
  };
}

/** Ручной перевод, который «принял бы» любую подпись, — чтобы поймать путаницу провайдеров. */
const PERMISSIVE_MANUAL = stub(MANUAL_PROVIDER_CODE, true);

function controller(online: PaymentProvider | null) {
  const applyWebhook = jest.fn<Promise<void>, [ParsedWebhook, unknown]>(() => Promise.resolve());
  const payments = { applyWebhook } as unknown as PaymentsService;
  const resolver = new PaymentProviderResolver({
    manual: PERMISSIVE_MANUAL,
    online,
    defaultChannel: online === null ? 'transfer' : 'online',
  });

  return { instance: new PaymentCallbacksController(payments, resolver), applyWebhook };
}

describe('колбэк Robokassa', () => {
  test('Robokassa выключена (PAYMENT_PROVIDER=manual) — 401, даже если ручной провайдер «согласен»', async () => {
    // Arrange
    const { instance, applyWebhook } = controller(null);

    // Act & Assert
    await expect(instance.handleRobokassaResult({ InvId: '42' })).rejects.toThrow(UnauthorizedException);
    expect(applyWebhook).not.toHaveBeenCalled();
  });

  test('подпись проверяет именно Robokassa: неверная — 401 и ни одного вызова сервиса', async () => {
    // Arrange
    const { instance, applyWebhook } = controller(stub(ROBOKASSA_PROVIDER_CODE, false));

    // Act & Assert
    await expect(instance.handleRobokassaResult({ InvId: '42' })).rejects.toThrow(UnauthorizedException);
    expect(applyWebhook).not.toHaveBeenCalled();
  });

  test('верная подпись — событие уходит под кодом robokassa, ответ OK{InvId}', async () => {
    // Arrange
    const { instance, applyWebhook } = controller(stub(ROBOKASSA_PROVIDER_CODE, true));

    // Act
    const answer = await instance.handleRobokassaResult({ InvId: '42' });

    // Assert
    expect(answer).toBe('OK42');
    expect(applyWebhook).toHaveBeenCalledTimes(1);
    expect(applyWebhook.mock.calls[0]?.[0].provider).toBe(ROBOKASSA_PROVIDER_CODE);
  });
});
