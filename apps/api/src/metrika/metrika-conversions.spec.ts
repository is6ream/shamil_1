import { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../database/prisma.service';
import {
  TEST_DONATION_KOPECKS,
  createPendingDonation,
  createTestPrismaService,
  describeDatabase,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { DonationStatus, MetrikaConversionStatus } from '../generated/prisma/enums';
import type { ParsedWebhook } from '../payments/payment-provider.types';
import { PaymentsService } from '../payments/payments.service';
import { ROBOKASSA_PROVIDER_CODE } from '../config/constants';
import { ConversionEnqueueService } from './conversion-enqueue.service';
import { ConversionUploadService } from './conversion-upload.service';
import { MetrikaApiError } from './metrika-api';
import type { MetrikaApi, UploadRequest, UploadingInfo } from './metrika-api';
import { MetrikaConversionRepository } from './metrika-conversion.repository';
import { CONVERSION_MATCH_WINDOW_MS, MAX_UPLOAD_ATTEMPTS, STALE_LOCK_MS } from './metrika.constants';
import { createMetrikaConfig } from './testing/metrika-test-config';

/**
 * Офлайн-конверсии на реальном PostgreSQL: постановка в очередь в транзакции
 * оплаты, идемпотентность (unique donation_id), захват строк `SKIP LOCKED`
 * и переходы статусов. HTTP Метрики — фейк, в сеть ничего не уходит.
 */

const CLIENT_ID = '1729000000123456789';
const YCLID = '5207465128348827647';
const MINUTE_MS = 60_000;

/** Фейковый API: записывает файлы, отвечает по сценарию. */
class FakeMetrikaApi implements MetrikaApi {
  readonly uploads: UploadRequest[] = [];
  uploadError: Error | null = null;
  uploadingStatus = 'PROCESSED';
  statusError: unknown = null;
  sourceOverride: number | null | undefined = undefined;
  acceptedOverride: number | null | undefined = undefined;
  private counts = new Map<bigint, number>();
  private nextId = 1000n;

  uploadOfflineConversions(request: UploadRequest): Promise<UploadingInfo> {
    this.uploads.push(request);

    if (this.uploadError !== null) {
      return Promise.reject(this.uploadError);
    }

    this.nextId += 1n;

    const count = request.csv.trim().split('\n').length - 1;
    this.counts.set(this.nextId, count);
    return Promise.resolve({ id: this.nextId, status: 'UPLOADED', sourceQuantity: this.sourceOverride === undefined ? count : this.sourceOverride, lineQuantity: this.acceptedOverride === undefined ? count : this.acceptedOverride });
  }

  getUploading(id: bigint): Promise<UploadingInfo> {
    if (this.statusError !== null) {
      return Promise.reject(this.statusError);
    }

    return Promise.resolve({ id, status: this.uploadingStatus, sourceQuantity: this.sourceOverride === undefined ? this.counts.get(id) : this.sourceOverride, lineQuantity: this.acceptedOverride === undefined ? this.counts.get(id) : this.acceptedOverride });
  }
}

function webhook(invoiceNo: number): ParsedWebhook {
  return {
    provider: ROBOKASSA_PROVIDER_CODE,
    providerEventId: String(invoiceNo),
    invoiceNo,
    status: DonationStatus.paid,
    amountKopecks: TEST_DONATION_KOPECKS,
    method: 'sbp',
    acknowledgement: `OK${invoiceNo}`,
  };
}

describeDatabase('офлайн-конверсии Метрики', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  let repository: MetrikaConversionRepository;
  let fixtures: TestFixtures;
  let api: FakeMetrikaApi;
  let uploads: ConversionUploadService;

  beforeAll(() => {
    prisma = createTestPrismaService();
    payments = new PaymentsService(
      prisma,
      new AuditService(prisma),
      new ConversionEnqueueService(createMetrikaConfig()),
    );
    repository = new MetrikaConversionRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma);
    api = new FakeMetrikaApi();
    uploads = new ConversionUploadService(repository, api);
  });

  /** Pending-донат Robokassa с идентификаторами визита, оплаченный колбэком. */
  async function paidOnline(ids: { ymClientId?: string; yclid?: string } = { ymClientId: CLIENT_ID }) {
    const donation = await createPendingDonation(prisma, fixtures, { provider: ROBOKASSA_PROVIDER_CODE });

    await prisma.donation.update({ where: { id: donation.id }, data: ids });
    await payments.applyWebhook(webhook(donation.invoiceNo), { InvId: String(donation.invoiceNo) });

    return donation;
  }

  async function onlyConversion() {
    const [row, ...rest] = await conversions();

    if (row === undefined || rest.length > 0) {
      throw new Error(`Ожидалась одна строка outbox, а их ${rest.length + (row === undefined ? 0 : 1)}`);
    }

    return row;
  }

  function conversions() {
    return prisma.metrikaOfflineConversion.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /** Время после оплаты: `DateTime` должен быть в прошлом. */
  function later(minutes = 5): Date {
    return new Date(Date.now() + minutes * MINUTE_MS);
  }

  describe('постановка в очередь', () => {
    test('колбэк Robokassa → одна строка PENDING с суммой, целью и ClientID', async () => {
      // Act
      const donation = await paidOnline();

      // Assert
      const [row, ...rest] = await conversions();
      const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });

      expect(rest).toHaveLength(0);
      expect(row).toMatchObject({
        donationId: donation.id,
        status: MetrikaConversionStatus.PENDING,
        target: 'donation_paid',
        clientId: CLIENT_ID,
        amountKopecks: TEST_DONATION_KOPECKS,
        currency: 'RUB',
        conversionAt: stored.paidAt,
      });
    });

    test('повторный колбэк не создаёт вторую строку', async () => {
      // Arrange
      const donation = await paidOnline();

      // Act
      await payments.applyWebhook(webhook(donation.invoiceNo), { InvId: String(donation.invoiceNo) });
      await payments.applyWebhook(
        { ...webhook(donation.invoiceNo), providerEventId: 'another-event' },
        { InvId: String(donation.invoiceNo) },
      );

      // Assert
      expect(await conversions()).toHaveLength(1);
    });

    test('подтверждение ручного доната админом → строка в очереди, повтор — без дубля', async () => {
      // Arrange
      const donation = await createPendingDonation(prisma, fixtures);

      await prisma.donation.update({ where: { id: donation.id }, data: { yclid: YCLID } });

      // Act
      await payments.confirmManual(donation.id);
      await payments.confirmManual(donation.id);

      // Assert
      expect(await onlyConversion()).toMatchObject({ status: MetrikaConversionStatus.PENDING, yclid: YCLID, clientId: null });
    });

    test('без ClientID и yclid — SKIPPED/no_identifier', async () => {
      // Act
      await paidOnline({});

      // Assert
      expect(await onlyConversion()).toMatchObject({ status: MetrikaConversionStatus.SKIPPED, skipReason: 'no_identifier' });
    });

    test('pending-донат без оплаты в очередь не попадает', async () => {
      // Act
      await createPendingDonation(prisma, fixtures);

      // Assert
      expect(await conversions()).toHaveLength(0);
    });

    test('повторная постановка того же доната — no-op, транзакция не падает', async () => {
      // Arrange
      const donation = await paidOnline();
      const enqueue = new ConversionEnqueueService(createMetrikaConfig());

      // Act
      await prisma.$transaction((tx) => enqueue.enqueue(tx, donation.id));

      // Assert
      expect(await conversions()).toHaveLength(1);
    });

    test('постановка неоплаченного доната — ошибка в коде вызывающего', async () => {
      // Arrange
      const donation = await createPendingDonation(prisma, fixtures);
      const enqueue = new ConversionEnqueueService(createMetrikaConfig());

      // Act + Assert
      await expect(prisma.$transaction((tx) => enqueue.enqueue(tx, donation.id))).resolves.toBeUndefined();
      expect(await prisma.metrikaOfflineConversion.count()).toBe(0);
    });

    test('сбой чтения идентификаторов не откатывает оплату и событие', async () => {
      const enqueue = new ConversionEnqueueService(createMetrikaConfig());
      const original = enqueue.enqueue.bind(enqueue);
      jest.spyOn(enqueue, 'enqueue').mockImplementation((tx, id) => original(new Proxy(tx, {
        get(target, key) {
          if (key === 'donation') return {
            ...target.donation,
            findUniqueOrThrow: () => target.$queryRawUnsafe('SELECT 1/0'),
          };
          return Reflect.get(target, key);
        },
      }), id));
      const service = new PaymentsService(prisma, new AuditService(prisma), enqueue);
      const donation = await createPendingDonation(prisma, fixtures, { provider: ROBOKASSA_PROVIDER_CODE });
      await service.applyWebhook(webhook(donation.invoiceNo), { InvId: String(donation.invoiceNo) });
      expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe(DonationStatus.paid);
      expect(await prisma.paymentEvent.count({ where: { donationId: donation.id } })).toBe(1);
      expect(await conversions()).toHaveLength(0);
    });

    test('сбой записи в outbox не откатывает оплату: донат paid, строки нет', async () => {
      // Arrange: цель длиннее VARCHAR(64) — INSERT в outbox падает
      const broken = new PaymentsService(
        prisma,
        new AuditService(prisma),
        new ConversionEnqueueService(createMetrikaConfig({ offlineGoal: 'x'.repeat(65) })),
      );
      const donation = await createPendingDonation(prisma, fixtures, { provider: ROBOKASSA_PROVIDER_CODE });

      await prisma.donation.update({ where: { id: donation.id }, data: { ymClientId: CLIENT_ID } });

      // Act
      await broken.applyWebhook(webhook(donation.invoiceNo), { InvId: String(donation.invoiceNo) });

      // Assert
      const stored = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });

      expect(stored.status).toBe(DonationStatus.paid);
      expect(await conversions()).toHaveLength(0);
      expect(await prisma.paymentEvent.count({ where: { donationId: donation.id } })).toBe(1);
    });

    test('база не даёт записать ClientID не из цифр', async () => {
      // Arrange
      const donation = await createPendingDonation(prisma, fixtures);

      // Act + Assert
      await expect(
        prisma.donation.update({ where: { id: donation.id }, data: { ymClientId: '12a' } }),
      ).rejects.toThrow();
    });
  });

  describe('выгрузка', () => {
    test('успех → UPLOADED с uploading_id, затем опрос → PROCESSED', async () => {
      // Arrange
      await paidOnline();
      api.uploadingStatus = 'PREPARED';

      // Act
      const first = await uploads.runOnce(later());

      // Assert: файл ушёл, строка ждёт обработки
      expect(first.uploaded).toBe(1);
      expect(api.uploads).toHaveLength(1);
      expect(api.uploads.map((upload) => upload.csv).join('')).toMatch(
        /^ClientId,Target,DateTime,Price,Currency\n1729000000123456789,donation_paid,\d+,100\.00,RUB\n$/,
      );
      expect((await onlyConversion())).toMatchObject({
        status: MetrikaConversionStatus.UPLOADED,
        uploadingId: 1001n,
        attempts: 1,
      });

      // Act: Метрика закончила обработку
      api.uploadingStatus = 'PROCESSED';
      const second = await uploads.runOnce(later(10));

      // Assert
      expect(second.processed).toBe(1);
      expect(api.uploads).toHaveLength(1);
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.PROCESSED);
    });

    test('Метрика ещё обрабатывает — строка остаётся UPLOADED и не выгружается снова', async () => {
      // Arrange
      await paidOnline();
      api.uploadingStatus = 'MATCHED';

      // Act
      await uploads.runOnce(later());
      await uploads.runOnce(later(10));

      // Assert
      expect(api.uploads).toHaveLength(1);
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.UPLOADED);
    });

    test.each([0, 1, null])('incomplete acceptance %p quarantines entire batch with upload ID and no resend', async (accepted) => {
      await paidOnline();
      await paidOnline({ ymClientId: '42' });
      api.acceptedOverride = accepted;
      await uploads.runOnce(later());
      await uploads.runOnce(later(10));
      const rows = await prisma.metrikaOfflineConversion.findMany();
      expect(api.uploads).toHaveLength(1);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.status).toBe(MetrikaConversionStatus.FAILED);
        expect(row.uploadingId).toBe(1001n);
        expect(row.lastError).toContain('acceptance_requires_review');
        expect(row.lastError).toContain(`accepted=${accepted ?? 'unknown'}`);
      }
    });

    test('partial acceptance revealed by polling never marks rows PROCESSED', async () => {
      await paidOnline();
      api.uploadingStatus = 'UPLOADED';
      await uploads.runOnce(later());
      api.acceptedOverride = 0;
      api.uploadingStatus = 'PROCESSED';
      await uploads.runOnce(later(10));
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.FAILED);
      expect(api.uploads).toHaveLength(1);
    });

    test('ClientID и yclid — разными файлами, одна оплата — один файл', async () => {
      // Arrange
      await paidOnline({ ymClientId: CLIENT_ID });
      await paidOnline({ yclid: YCLID });
      await paidOnline({ ymClientId: '42', yclid: '43' });

      // Act
      await uploads.runOnce(later());

      // Assert
      const headers = api.uploads.map((upload) => upload.csv.slice(0, upload.csv.indexOf(','))).sort();
      const rowsTotal = api.uploads.reduce((sum, upload) => sum + upload.csv.trim().split('\n').length - 1, 0);

      expect(headers).toEqual(['ClientId', 'Yclid']);
      expect(rowsTotal).toBe(3);
      expect(api.uploads.find((u) => u.csv.startsWith('ClientId'))?.csv).not.toContain('43');
    });

    test('DateTime только в прошлом: оплата моложе минуты ждёт следующего прохода', async () => {
      // Arrange
      await paidOnline();

      // Act
      const summary = await uploads.runOnce(new Date());

      // Assert
      expect(summary.uploaded).toBe(0);
      expect(api.uploads).toHaveLength(0);
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.PENDING);
    });

    test('старше 21 дня — SKIPPED/expired без выгрузки', async () => {
      // Arrange
      await paidOnline();

      // Act
      const summary = await uploads.runOnce(new Date(Date.now() + CONVERSION_MATCH_WINDOW_MS + MINUTE_MS));

      // Assert
      expect(summary.expired).toBe(1);
      expect(api.uploads).toHaveLength(0);
      expect((await onlyConversion())).toMatchObject({
        status: MetrikaConversionStatus.SKIPPED,
        skipReason: 'expired',
      });
    });

    test('429/5xx → обратно в PENDING, attempts++; исчерпав попытки — FAILED', async () => {
      // Arrange
      await paidOnline();
      api.uploadError = new MetrikaApiError('Метрика ответила 503', 503, true);

      // Act
      const first = await uploads.runOnce(later());

      // Assert
      expect(first.retried).toBe(1);
      expect((await onlyConversion())).toMatchObject({
        status: MetrikaConversionStatus.PENDING,
        attempts: 1,
        lastError: 'Метрика ответила 503',
      });

      // Act: остальные попытки
      for (let attempt = 2; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
        await uploads.runOnce(later(attempt));
      }

      // Assert
      expect((await onlyConversion())).toMatchObject({
        status: MetrikaConversionStatus.FAILED,
        attempts: MAX_UPLOAD_ATTEMPTS,
      });
      expect(api.uploads).toHaveLength(MAX_UPLOAD_ATTEMPTS);
    });

    test('401/400 → FAILED сразу, без повторов в следующих проходах', async () => {
      // Arrange
      await paidOnline();
      api.uploadError = new MetrikaApiError('Метрика ответила 401: ***', 401, false);

      // Act
      const summary = await uploads.runOnce(later());
      await uploads.runOnce(later(10));

      // Assert
      expect(summary.failed).toBe(1);
      expect(api.uploads).toHaveLength(1);
      expect((await onlyConversion())).toMatchObject({ status: MetrikaConversionStatus.FAILED, attempts: 1 });
    });

    test('неизвестная ошибка выгрузки — как временный сбой: обратно в очередь', async () => {
      // Arrange
      await paidOnline();
      api.uploadError = new TypeError('fetch failed');

      // Act
      const summary = await uploads.runOnce(later());

      // Assert
      expect(summary.retried).toBe(1);
      expect(await onlyConversion()).toMatchObject({ status: MetrikaConversionStatus.PENDING, attempts: 1 });
    });

    test('сбой опроса статуса не фатален: строка ждёт следующего прохода', async () => {
      // Arrange
      await paidOnline();
      api.statusError = 'gateway timeout';

      // Act
      const summary = await uploads.runOnce(later());

      // Assert
      expect(summary).toMatchObject({ uploaded: 1, processed: 0 });
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.UPLOADED);
    });

    test('сетевой сбой (Error) при опросе статуса — строка тоже ждёт следующего прохода', async () => {
      // Arrange
      await paidOnline();
      api.statusError = new TypeError('fetch failed');

      // Act
      const summary = await uploads.runOnce(later());

      // Assert
      expect(summary).toMatchObject({ uploaded: 1, processed: 0 });
      expect((await onlyConversion()).status).toBe(MetrikaConversionStatus.UPLOADED);
    });

    test('LINKAGE_FAILURE → FAILED с причиной', async () => {
      // Arrange
      await paidOnline();
      api.uploadingStatus = 'LINKAGE_FAILURE';

      // Act
      const summary = await uploads.runOnce(later());

      // Assert
      expect(summary.linkageFailed).toBe(1);
      const row = await onlyConversion();

      expect(row.status).toBe(MetrikaConversionStatus.FAILED);
      expect(row.lastError).toContain('LINKAGE_FAILURE');
    });

    test('два параллельных прохода не выгружают одну строку дважды', async () => {
      // Arrange
      for (let i = 0; i < 6; i += 1) {
        await paidOnline({ ymClientId: String(100 + i) });
      }

      const secondUploads = new ConversionUploadService(repository, api);

      // Act
      await Promise.all([uploads.runOnce(later()), secondUploads.runOnce(later())]);

      // Assert
      const uploadedIds = api.uploads.flatMap((upload) =>
        upload.csv.trim().split('\n').slice(1).map((line) => line.split(',')[0]),
      );

      expect(uploadedIds.sort()).toEqual(['100', '101', '102', '103', '104', '105']);
    });

    test('зависшая в UPLOADING строка возвращается в очередь', async () => {
      // Arrange: инстанс забрал строку и упал
      await paidOnline();
      await repository.claimBatch(later(), 10);

      // Act: рано — строка не возвращается; позже окна блокировки — возвращается
      const early = await uploads.runOnce(later(2));
      const late = await uploads.runOnce(new Date(later().getTime() + STALE_LOCK_MS + MINUTE_MS));

      // Assert
      expect(early.reclaimed).toBe(0);
      expect(early.uploaded).toBe(0);
      expect(late.reclaimed).toBe(1);
      expect(late.uploaded).toBe(1);
    });

    test('строка, раз за разом зависающая в UPLOADING, после лимита попыток — FAILED', async () => {
      // Arrange
      await paidOnline();
      let now = later();

      // Act: инстанс забирает строку и «падает» MAX_UPLOAD_ATTEMPTS раз подряд
      for (let i = 0; i < MAX_UPLOAD_ATTEMPTS; i += 1) {
        await repository.claimBatch(now, 10);
        now = new Date(now.getTime() + STALE_LOCK_MS + MINUTE_MS);
        await repository.reclaimStale(now);
      }

      // Assert
      expect(await onlyConversion()).toMatchObject({
        status: MetrikaConversionStatus.FAILED,
        attempts: MAX_UPLOAD_ATTEMPTS,
        lockedAt: null,
      });
    });

    test('без адаптера (выгрузка выключена) проход не запускается', async () => {
      // Arrange
      const disabled = new ConversionUploadService(repository, null);

      // Act + Assert
      await expect(disabled.runOnce()).rejects.toThrow('YM_OFFLINE_ENABLED');
    });
  });
});
