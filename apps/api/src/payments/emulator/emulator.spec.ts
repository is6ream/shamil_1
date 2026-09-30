import { createHash, randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import type { AppConfig, PaymentConfig } from '../../config/configuration';
import { PaymentHashAlgorithm, PaymentProviderCode } from '../../config/env.validation';
import { RobokassaProvider } from '../providers/robokassa.provider';
import { buildCallbackBody, buildSuccessParams } from './callback-body';
import { CheckoutRejectedError, parseCheckoutRequest } from './checkout-request';
import { EMULATOR_PAYER_EMAIL } from './emulator.constants';
import { RobokassaEmulatorService } from './robokassa-emulator.service';
import { escapeHtml, renderCheckoutPage } from './emulator-page';
import { ScenarioLinkError, signScenario, verifyScenario } from './scenario-link';

/**
 * Эмулятор переиспользует функции подписи из `robokassa/signature.ts`, и общая
 * ошибка в них спряталась бы: провайдер и эмулятор сошлись бы друг с другом,
 * а с настоящей Robokassa — нет. Поэтому эталоны здесь посчитаны напрямую
 * через `node:crypto` по литеральной строке из документации Robokassa.
 */

const ORDER_ID = '11111111-2222-4333-8444-555555555555';

const PAYMENT: PaymentConfig = {
  provider: PaymentProviderCode.Robokassa,
  isTest: true,
  hashAlgorithm: PaymentHashAlgorithm.Md5,
  merchantId: 'shamil-local',
  secretKey: 'pass1',
  webhookSecret: 'pass2',
  paymentUrl: 'http://localhost:3001/api/dev/robokassa/checkout',
  emulatorEnabled: true,
  receipt: { enabled: false },
};

function literalHash(algorithm: 'md5' | 'sha256', source: string): string {
  return createHash(algorithm).update(source, 'utf8').digest('hex');
}

function checkoutQuery(algorithm: 'md5' | 'sha256'): Record<string, string> {
  return {
    MerchantLogin: 'shamil-local',
    OutSum: '100.00',
    InvId: '42',
    Description: 'Пожертвование',
    Culture: 'ru',
    Encoding: 'utf-8',
    IsTest: '1',
    Shp_order_id: ORDER_ID,
    SignatureValue: literalHash(algorithm, `shamil-local:100.00:42:pass1:Shp_order_id=${ORDER_ID}`),
  };
}

describe('эмулятор: проверка ссылки на оплату', () => {
  test.each(['md5', 'sha256'] as const)('подпись %s, посчитанная вручную, принимается', (algorithm) => {
    // Act
    const order = parseCheckoutRequest(checkoutQuery(algorithm), {
      ...PAYMENT,
      hashAlgorithm: algorithm === 'md5' ? PaymentHashAlgorithm.Md5 : PaymentHashAlgorithm.Sha256,
    });

    // Assert
    expect(order).toMatchObject({ outSum: '100.00', invId: '42', amountKopecks: 10_000n });
    expect(order.shp).toEqual({ Shp_order_id: ORDER_ID });
  });

  test('подпись в верхнем регистре тоже принимается', () => {
    const query = checkoutQuery('md5');

    expect(() =>
      parseCheckoutRequest({ ...query, SignatureValue: query.SignatureValue?.toUpperCase() }, PAYMENT),
    ).not.toThrow();
  });

  test('ссылка от настоящего RobokassaProvider проходит проверку эмулятора', async () => {
    // Arrange
    const provider = new RobokassaProvider(new ConfigService<AppConfig, true>({ payment: PAYMENT }));
    const created = await provider.createPayment({
      invoiceNo: 7,
      donationId: ORDER_ID,
      amountKopecks: 12_345n,
      description: 'Пожертвование: Мечеть «Шамиль»',
    });

    // Act
    const url = new URL(created.redirectUrl);
    const order = parseCheckoutRequest(Object.fromEntries(url.searchParams), PAYMENT);

    // Assert
    expect(url.origin + url.pathname).toBe(PAYMENT.paymentUrl);
    expect(order).toMatchObject({ outSum: '123.45', invId: '7', description: 'Пожертвование: Мечеть «Шамиль»' });
  });

  test.each([
    ['чужой пароль #1', { SignatureValue: literalHash('md5', `shamil-local:100.00:42:wrong:Shp_order_id=${ORDER_ID}`) }],
    ['подменённая сумма', { OutSum: '1000.00' }],
    ['подменённый заказ', { Shp_order_id: '99999999-2222-4333-8444-555555555555' }],
    ['чужой магазин', { MerchantLogin: 'other-shop' }],
    ['без IsTest=1', { IsTest: '0' }],
    ['неизвестный параметр', { Extra: '1' }],
    ['дублированный параметр', { OutSum: ['100.00', '1.00'] }],
    ['кривой InvId', { InvId: '-1' }],
    ['кривой OutSum', { OutSum: '100,5,5' }],
  ])('%s → отказ', (_name, override) => {
    expect(() => parseCheckoutRequest({ ...checkoutQuery('md5'), ...override }, PAYMENT)).toThrow(
      CheckoutRejectedError,
    );
  });

  test('без SignatureValue → отказ с именем параметра', () => {
    const query: Record<string, string> = { ...checkoutQuery('md5') };
    delete query.SignatureValue;

    expect(() => parseCheckoutRequest(query, PAYMENT)).toThrow(/SignatureValue/);
  });
});

describe('эмулятор: тело колбэка', () => {
  const ORDER = { outSum: '100.00', invId: '42', shp: { Shp_order_id: ORDER_ID } };

  test.each(['md5', 'sha256'] as const)('подпись %s = OutSum:InvId:Пароль#2:Shp_…', (algorithm) => {
    // Act
    const body = buildCallbackBody(
      ORDER,
      { ...PAYMENT, hashAlgorithm: algorithm === 'md5' ? PaymentHashAlgorithm.Md5 : PaymentHashAlgorithm.Sha256 },
      { method: 'sbp' },
    );

    // Assert
    expect(body.SignatureValue).toBe(
      literalHash(algorithm, `100.00:42:pass2:Shp_order_id=${ORDER_ID}`).toUpperCase(),
    );
    expect(body).toMatchObject({
      OutSum: '100.00',
      InvId: '42',
      Shp_order_id: ORDER_ID,
      IncCurrLabel: 'SBP',
      EMail: EMULATOR_PAYER_EMAIL,
    });
  });

  test('колбэк от эмулятора проходит проверку настоящего RobokassaProvider', () => {
    // Arrange
    const provider = new RobokassaProvider(new ConfigService<AppConfig, true>({ payment: PAYMENT }));

    // Act
    const body = buildCallbackBody(ORDER, PAYMENT, { method: 'card' });

    // Assert
    expect(provider.verifySignature(body)).toBe(true);
    expect(provider.parseWebhook(body)).toMatchObject({ amountKopecks: 10_000n, method: 'card' });
  });

  test('на 1 ₽ меньше — сумма уменьшена и подписана заново', () => {
    // Act
    const body = buildCallbackBody(ORDER, PAYMENT, { method: 'sbp', underpaid: true });

    // Assert
    expect(body.OutSum).toBe('99.00');
    expect(body.SignatureValue).toBe(
      literalHash('md5', `99.00:42:pass2:Shp_order_id=${ORDER_ID}`).toUpperCase(),
    );
  });

  test('битая подпись не проходит проверку провайдера', () => {
    // Arrange
    const provider = new RobokassaProvider(new ConfigService<AppConfig, true>({ payment: PAYMENT }));

    // Act & Assert
    expect(provider.verifySignature(buildCallbackBody(ORDER, PAYMENT, { method: 'sbp', badSignature: true }))).toBe(
      false,
    );
  });

  test('Success URL подписан паролем #1, как у Robokassa', () => {
    expect(buildSuccessParams(ORDER, PAYMENT)).toEqual({
      OutSum: '100.00',
      InvId: '42',
      SignatureValue: literalHash('md5', `100.00:42:pass1:Shp_order_id=${ORDER_ID}`).toUpperCase(),
      Culture: 'ru',
      Shp_order_id: ORDER_ID,
    });
  });
});

describe('эмулятор: ссылки сценариев', () => {
  const key = randomBytes(32);
  const payload = {
    order: { outSum: '100.00', invId: '42', shp: { Shp_order_id: ORDER_ID } },
    scenario: 'pay' as const,
    method: 'sbp' as const,
    expiresAt: Date.now() + 60_000,
  };

  test('подписанная ссылка разбирается обратно', () => {
    expect(verifyScenario(key, signScenario(key, payload))).toEqual(payload);
  });

  test('подменённая сумма в ссылке — отказ', () => {
    // Arrange
    const signed = signScenario(key, payload);
    const forged = signScenario(randomBytes(32), { ...payload, order: { ...payload.order, outSum: '1000000.00' } });

    // Act & Assert
    expect(() => verifyScenario(key, { p: forged.p, s: signed.s })).toThrow(ScenarioLinkError);
  });

  test('ссылка чужого запуска (другой ключ) — отказ', () => {
    expect(() => verifyScenario(key, signScenario(randomBytes(32), payload))).toThrow(ScenarioLinkError);
  });

  test('устаревшая ссылка — отказ', () => {
    expect(() => verifyScenario(key, signScenario(key, { ...payload, expiresAt: 1 }))).toThrow(/устарела/);
  });
});

describe('эмулятор: ключ ссылок из окружения', () => {
  const SITE_URL = 'https://shamil-web.example';

  function serviceWith(emulatorLinkSecret?: string): RobokassaEmulatorService {
    return new RobokassaEmulatorService(
      new ConfigService<AppConfig, true>({
        payment: { ...PAYMENT, emulatorLinkSecret },
        publicUrls: { apiUrl: 'https://shamil-api.example', siteUrl: SITE_URL },
      }),
    );
  }

  /** Ссылка «Отказаться»: сценарий без колбэка, сеть в тесте не нужна. */
  function refuseLink(service: RobokassaEmulatorService): { p: string; s: string } {
    const html = service.renderCheckout(checkoutQuery('md5'));
    const href = /href="([^"]+)">Отказаться от оплаты/.exec(html)?.[1];

    if (href === undefined) {
      throw new Error('На странице эмулятора нет ссылки «Отказаться от оплаты»');
    }

    const url = new URL(href.replaceAll('&amp;', '&'));

    return { p: url.searchParams.get('p') ?? '', s: url.searchParams.get('s') ?? '' };
  }

  test('ссылку одного инстанса принимает другой с тем же секретом', async () => {
    // Arrange: два инстанса serverless-функции или холодный старт
    const secret = 'a'.repeat(32);
    const signed = refuseLink(serviceWith(secret));

    // Act
    const redirect = await serviceWith(secret).runScenario(signed);

    // Assert
    expect(redirect).toBe(`${SITE_URL}/`);
  });

  test('инстанс с другим секретом ссылку отклоняет', async () => {
    // Arrange
    const signed = refuseLink(serviceWith('a'.repeat(32)));

    // Act & Assert
    await expect(serviceWith('b'.repeat(32)).runScenario(signed)).rejects.toThrow(ScenarioLinkError);
  });

  test('без секрета ключ случайный: ссылка не переживает перезапуск', async () => {
    // Arrange
    const signed = refuseLink(serviceWith());

    // Act & Assert
    await expect(serviceWith().runScenario(signed)).rejects.toThrow(ScenarioLinkError);
  });
});

describe('эмулятор: страница', () => {
  test('описание из query экранируется', () => {
    // Act
    const html = renderCheckoutPage({
      outSum: '100.00',
      invId: '42',
      description: '<script>alert(1)</script>',
      payLinks: { sbp: '/a?x=1&y=2', card: '/b', sberpay: '/c', tpay: '/d' },
      scenarioLinks: {
        pay_delay_10: '/e',
        pay_delay_45: '/f',
        pay_twice: '/g',
        pay_underpaid: '/h',
        bad_signature: '/i',
        refuse: '/j',
      },
    });

    // Assert
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="/a?x=1&amp;y=2"');
    expect(html).toContain('Эмулятор Robokassa');
  });

  test('escapeHtml экранирует кавычки', () => {
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});
