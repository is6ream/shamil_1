import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MANUAL_PROVIDER_CODE, ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import type { AppConfig, PaymentConfig } from '../config/configuration';
import { PaymentHashAlgorithm, PaymentProviderCode } from '../config/env.validation';
import { ONLINE_UNAVAILABLE_MESSAGE } from './payment-provider.resolver';
import { createPaymentProviderResolver } from './payments.module';

const ROBOKASSA_PAYMENT: PaymentConfig = {
  provider: PaymentProviderCode.Robokassa,
  isTest: true,
  hashAlgorithm: PaymentHashAlgorithm.Md5,
  merchantId: 'demo',
  secretKey: 'password_1',
  webhookSecret: 'password_2',
  paymentUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx',
  emulatorEnabled: false,
  receipt: { enabled: false },
};

/** Как `configuration()` собирает конфиг при `PAYMENT_PROVIDER=manual`: пароли пустые. */
const MANUAL_PAYMENT: PaymentConfig = {
  ...ROBOKASSA_PAYMENT,
  provider: PaymentProviderCode.Manual,
  merchantId: '',
  secretKey: '',
  webhookSecret: '',
};

function resolverFor(payment: PaymentConfig) {
  return createPaymentProviderResolver(
    new ConfigService<AppConfig, true>({
      payment,
      publicUrls: { apiUrl: 'http://localhost:3001', siteUrl: 'http://localhost:3000' },
    }),
  );
}

describe('выбор провайдера по каналу', () => {
  describe('PAYMENT_PROVIDER=robokassa', () => {
    const resolver = resolverFor(ROBOKASSA_PAYMENT);

    test('online → Robokassa', () => {
      expect(resolver.forChannel('online').code).toBe(ROBOKASSA_PROVIDER_CODE);
    });

    test('transfer → ручной перевод, а не оплата картой', () => {
      expect(resolver.forChannel('transfer').code).toBe(MANUAL_PROVIDER_CODE);
    });

    test('без канала — прежнее поведение: провайдер из PAYMENT_PROVIDER', () => {
      expect(resolver.forChannel().code).toBe(ROBOKASSA_PROVIDER_CODE);
    });

    test('колбэк Robokassa находит Robokassa по коду', () => {
      expect(resolver.byCode(ROBOKASSA_PROVIDER_CODE)?.code).toBe(ROBOKASSA_PROVIDER_CODE);
    });
  });

  describe('PAYMENT_PROVIDER=manual', () => {
    test('стартует без паролей Robokassa', () => {
      expect(() => resolverFor(MANUAL_PAYMENT)).not.toThrow();
    });

    const resolver = resolverFor(MANUAL_PAYMENT);

    test('online → 400 с просьбой перевести по реквизитам', () => {
      expect(() => resolver.forChannel('online')).toThrow(BadRequestException);
      expect(() => resolver.forChannel('online')).toThrow(ONLINE_UNAVAILABLE_MESSAGE);
    });

    test('transfer и запрос без канала → ручной перевод', () => {
      expect(resolver.forChannel('transfer').code).toBe(MANUAL_PROVIDER_CODE);
      expect(resolver.forChannel().code).toBe(MANUAL_PROVIDER_CODE);
    });

    test('колбэк Robokassa провайдера не находит — контроллер ответит 401', () => {
      expect(resolver.byCode(ROBOKASSA_PROVIDER_CODE)).toBeNull();
    });
  });
});
