import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { MANUAL_PROVIDER_CODE, ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SEED } from '../database/seed/campaign.data';
import {
  TEST_DONATION_KOPECKS,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus } from '../generated/prisma/enums';
import type { PaymentProvider } from '../payments/payment-provider.interface';
import {
  ONLINE_UNAVAILABLE_MESSAGE,
  PaymentProviderResolver,
} from '../payments/payment-provider.resolver';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';

const REDIRECT_URL = 'https://example.test/pay';

const PROVIDER_STUB: PaymentProvider = {
  code: MANUAL_PROVIDER_CODE,
  createPayment: (input) =>
    Promise.resolve({ redirectUrl: REDIRECT_URL, externalId: String(input.invoiceNo) }),
  verifySignature: () => false,
  parseWebhook: () => {
    throw new Error('в этих тестах не используется');
  },
};

/** Онлайн выключен: все донаты этих тестов идут по реквизитам, как раньше. */
const RESOLVER = new PaymentProviderResolver({
  manual: PROVIDER_STUB,
  online: null,
  defaultChannel: 'transfer',
});

function createPrisma(): PrismaService {
  const url = process.env.TEST_DATABASE_URL;

  if (url === undefined || url.length === 0) {
    throw new Error('TEST_DATABASE_URL не задан');
  }

  return new PrismaService(new ConfigService<AppConfig, true>({ database: { url } }));
}

/** 100 ₽ — минимум по ТЗ, он же слоган сбора. */
const VALID_AMOUNT = Number(TEST_DONATION_KOPECKS);

function dto(overrides: Partial<CreateDonationDto> = {}): CreateDonationDto {
  return { amountKopecks: VALID_AMOUNT, ...overrides } as CreateDonationDto;
}

describeDatabase('создание доната', () => {
  let prisma: PrismaService;
  let donations: DonationsService;
  let fixtures: TestFixtures;

  beforeAll(() => {
    prisma = createPrisma();
    donations = new DonationsService(prisma, RESOLVER);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);

    // Сервис ищет боевой сбор по слагу из сидов — фикстуры заводят свой,
    // поэтому рядом создаётся сбор с настоящим слагом.
    await prisma.campaign.create({
      data: {
        slug: CAMPAIGN_SEED.slug,
        title: CAMPAIGN_SEED.title,
        goalKopecks: CAMPAIGN_SEED.goalKopecks,
        minDonationKopecks: CAMPAIGN_SEED.minDonationKopecks,
      },
    });
  });

  test('донат создаётся в pending и получает ссылку на оплату', async () => {
    // Act
    const created = await donations.create(dto());

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });

    expect(created.redirectUrl).toBe(REDIRECT_URL);
    expect(stored.status).toBe(DonationStatus.pending);
    expect(stored.amountKopecks).toBe(TEST_DONATION_KOPECKS);
    // Ссылка выдана — значит номер счёта у провайдера записан
    expect(stored.providerPaymentId).toBe(String(stored.invoiceNo));
  });

  test('сумма ниже минимума сбора отклоняется', async () => {
    // Arrange: минимум лежит в БД и меняется без миграции — проверять
    // его надо по базе, а не по константе сборки
    const act = donations.create(dto({ amountKopecks: 5_000 }));

    // Assert
    await expect(act).rejects.toBeInstanceOf(BadRequestException);
  });

  test('регион из формы привязывается вместе с источником атрибуции', async () => {
    // Act
    const created = await donations.create(dto({ regionSlug: '02', regionSource: 'link' }));

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });

    expect(stored.regionId).toBe(fixtures.bashkortostanId);
    expect(stored.regionSource).toBe('link');
  });

  test('неизвестный регион не роняет донат: платёж важнее статистики', async () => {
    // Act
    const created = await donations.create(dto({ regionSlug: 'несуществующий-регион' }));

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });

    expect(stored.regionId).toBeNull();
    expect(stored.regionSource).toBeNull();
  });

  test('анонимность включена по умолчанию, подпись при этом не хранится', async () => {
    // Act: садака — скрытое поклонение (блок 9 ТЗ)
    const created = await donations.create(dto({ donorName: 'Наиль Хасанов' }));

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });

    expect(stored.isAnonymous).toBe(true);
    expect(stored.donorName).toBeNull();
  });

  test('снятая галочка анонимности сохраняет публичную подпись', async () => {
    // Act
    const created = await donations.create(
      dto({ isAnonymous: false, donorName: 'Наиль Хасанов' }),
    );

    // Assert
    const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });

    expect(stored.donorName).toBe('Наиль Хасанов');
  });

  test('телефон без согласия на обработку ПДн не принимается', async () => {
    // Arrange: тихо выбросить его было бы безопаснее для базы, но расхождение
    // формы и бэкенда всплыло бы не на фронте, а при проверке
    const act = donations.create(dto({ phone: '+79991234567' }));

    // Assert
    await expect(act).rejects.toBeInstanceOf(BadRequestException);

    const stored = await prisma.donationContact.count();
    expect(stored).toBe(0);
  });

  test('с согласием ПДн пишутся отдельной таблицей', async () => {
    // Act
    const created = await donations.create(
      dto({ phone: '+79991234567', fullName: 'Наиль Хасанов', personalDataConsent: true }),
    );

    // Assert
    const contact = await prisma.donationContact.findUniqueOrThrow({
      where: { donationId: created.orderId },
    });

    expect(contact.phoneE164).toBe('+79991234567');
    expect(contact.personalDataConsentAt).not.toBeNull();
  });
});

describeDatabase('статус заказа', () => {
  let prisma: PrismaService;
  let donations: DonationsService;

  beforeAll(() => {
    prisma = createPrisma();
    donations = new DonationsService(prisma, RESOLVER);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma);
    await prisma.campaign.create({
      data: {
        slug: CAMPAIGN_SEED.slug,
        title: CAMPAIGN_SEED.title,
        goalKopecks: CAMPAIGN_SEED.goalKopecks,
        minDonationKopecks: CAMPAIGN_SEED.minDonationKopecks,
      },
    });
  });

  test('до вебхука статус остаётся pending, а суммы отдаются строками', async () => {
    // Arrange
    const created = await donations.create(dto());

    // Act
    const status = await donations.getStatus(created.orderId);

    // Assert: BigInt в JSON не сериализуется — отсюда строки
    expect(status).toEqual({
      orderId: created.orderId,
      status: DonationStatus.pending,
      amountKopecks: String(VALID_AMOUNT),
      paidAmountKopecks: null,
      paidAt: null,
    });
  });

  test('в ответе нет персональных данных', async () => {
    // Arrange
    const created = await donations.create(
      dto({ phone: '+79991234567', fullName: 'Наиль Хасанов', personalDataConsent: true }),
    );

    // Act
    const status = await donations.getStatus(created.orderId);

    // Assert: эндпоинт публичный, телефон в него попасть не может (152-ФЗ)
    expect(JSON.stringify(status)).not.toContain('+79991234567');
    expect(JSON.stringify(status)).not.toContain('Наиль');
  });

  test('неизвестный заказ — 404', async () => {
    // Act
    const act = donations.getStatus('00000000-0000-4000-8000-000000000000');

    // Assert
    await expect(act).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('валидация формы доната', () => {
  function validate(payload: Record<string, unknown>): string[] {
    const instance = plainToInstance(CreateDonationDto, payload, {
      enableImplicitConversion: true,
    });

    return validateSync(instance).map((error) => error.property);
  }

  test('корректная форма проходит', () => {
    // Assert
    expect(validate({ amountKopecks: VALID_AMOUNT })).toEqual([]);
  });

  test('заполненный honeypot отсекает бота', () => {
    // Arrange: поле скрыто в вёрстке, человек его не заполняет
    const errors = validate({ amountKopecks: VALID_AMOUNT, antispam: 'бот был здесь' });

    // Assert
    expect(errors).toContain('antispam');
  });

  test('дробная сумма не принимается: деньги считаются целыми копейками', () => {
    // Assert
    expect(validate({ amountKopecks: 100.5 })).toContain('amountKopecks');
  });

  test('сумма ниже 100 ₽ и абсурдно большая не проходят', () => {
    // Assert
    expect(validate({ amountKopecks: 99 })).toContain('amountKopecks');
    expect(validate({ amountKopecks: 100_000_000_000 })).toContain('amountKopecks');
  });

  test('телефон не в E.164 не принимается', () => {
    // Assert: формат зеркалит CHECK donation_contact_phone_e164
    expect(validate({ amountKopecks: VALID_AMOUNT, phone: '89991234567' })).toContain('phone');
    expect(validate({ amountKopecks: VALID_AMOUNT, phone: '+79991234567' })).toEqual([]);
  });

  test('источник региона ограничен публичными значениями', () => {
    // Assert: 'admin' ставит только админский эндпоинт
    expect(validate({ amountKopecks: VALID_AMOUNT, regionSource: 'admin' })).toContain(
      'regionSource',
    );
  });
});

describeDatabase('канал оплаты', () => {
  const ONLINE_URL = 'https://auth.robokassa.test/pay';
  const TRANSFER_URL = 'http://localhost:3000/donate/transfer';

  const ONLINE_STUB: PaymentProvider = {
    code: ROBOKASSA_PROVIDER_CODE,
    createPayment: (input) =>
      Promise.resolve({ redirectUrl: ONLINE_URL, externalId: String(input.invoiceNo) }),
    verifySignature: () => false,
    parseWebhook: () => {
      throw new Error('в этих тестах не используется');
    },
  };

  const TRANSFER_STUB: PaymentProvider = {
    ...PROVIDER_STUB,
    createPayment: (input) =>
      Promise.resolve({ redirectUrl: TRANSFER_URL, externalId: String(input.invoiceNo) }),
  };

  let prisma: PrismaService;

  beforeAll(() => {
    prisma = createPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SEED.slug });
  });

  describe('PAYMENT_PROVIDER=robokassa', () => {
    const service = (): DonationsService =>
      new DonationsService(
        prisma,
        new PaymentProviderResolver({ manual: TRANSFER_STUB, online: ONLINE_STUB, defaultChannel: 'online' }),
      );

    test('transfer — донат ручного перевода и ссылка на реквизиты, а не на оплату картой', async () => {
      // Act
      const created = await service().create(dto({ channel: 'transfer' }));

      // Assert
      const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(stored.provider).toBe(MANUAL_PROVIDER_CODE);
      expect(created.redirectUrl).toBe(TRANSFER_URL);
    });

    test('online и запрос без канала — донат Robokassa', async () => {
      // Act
      const online = await service().create(dto({ channel: 'online' }));
      const legacy = await service().create(dto());

      // Assert
      const providers = await prisma.donation.findMany({
        where: { id: { in: [online.orderId, legacy.orderId] } },
        select: { provider: true },
      });
      expect(providers.map((row) => row.provider)).toEqual([ROBOKASSA_PROVIDER_CODE, ROBOKASSA_PROVIDER_CODE]);
      expect(online.redirectUrl).toBe(ONLINE_URL);
    });
  });

  describe('PAYMENT_PROVIDER=manual', () => {
    const service = (): DonationsService =>
      new DonationsService(
        prisma,
        new PaymentProviderResolver({ manual: TRANSFER_STUB, online: null, defaultChannel: 'transfer' }),
      );

    test('online — 400 с человеческим текстом и ни одного висящего заказа', async () => {
      // Act
      const act = service().create(dto({ channel: 'online' }));

      // Assert
      await expect(act).rejects.toThrow(ONLINE_UNAVAILABLE_MESSAGE);
      await expect(act).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.donation.count()).toBe(0);
    });

    test('transfer — ручной перевод', async () => {
      // Act
      const created = await service().create(dto({ channel: 'transfer' }));

      // Assert
      const stored = await prisma.donation.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(stored.provider).toBe(MANUAL_PROVIDER_CODE);
    });
  });
});

describe('CreateDonationDto: channel', () => {
  function errorsFor(body: Record<string, unknown>): string[] {
    return validateSync(plainToInstance(CreateDonationDto, body)).map((error) => error.property);
  }

  test.each(['online', 'transfer'])('«%s» принимается', (channel) => {
    expect(errorsFor({ amountKopecks: VALID_AMOUNT, channel })).toEqual([]);
  });

  test('неизвестный канал отклоняется', () => {
    expect(errorsFor({ amountKopecks: VALID_AMOUNT, channel: 'crypto' })).toEqual(['channel']);
  });
});
