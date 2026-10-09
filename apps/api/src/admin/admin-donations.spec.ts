import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';

import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import {
  TEST_DONATION_KOPECKS,
  TEST_PAID_AT,
  createPendingDonation,
  createTestAdmin,
  createTestPrismaService,
  describeDatabase,
  markPaid,
  resetDatabase,
  seedFixtures,
} from '../database/testing/test-database';
import type { TestFixtures } from '../database/testing/test-database';
import { AdminRole } from '../generated/prisma/enums';
import { RevalidationService } from '../revalidation/revalidation.service';
import { AdminDonationsQueryService } from './admin-donations-query.service';
import { CampaignAdminService } from './campaign-admin.service';
import { PII_MASK } from './donation-query';
import { DonationFiltersDto } from './dto/donation-list.dto';
import { ManualDonationService } from './manual-donation.service';

const META: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };
const PHONE = '+79991234567';
const FULL_NAME = 'Усман Усманов';

function filters(overrides: Partial<DonationFiltersDto> = {}): DonationFiltersDto {
  return Object.assign(new DonationFiltersDto(), overrides);
}

describeDatabase('пожертвования в админке', () => {
  let prisma: PrismaService;
  let query: AdminDonationsQueryService;
  let manual: ManualDonationService;
  let campaign: CampaignAdminService;
  let fixtures: TestFixtures;
  let editor: AdminPrincipal;
  let accountant: AdminPrincipal;

  jest.setTimeout(60_000);

  beforeAll(() => {
    prisma = createTestPrismaService();
    const audit = new AuditService(prisma);
    const revalidation = new RevalidationService(
      new ConfigService<AppConfig, true>({ revalidation: { url: 'http://127.0.0.1:9/api/revalidate' } }),
    );

    query = new AdminDonationsQueryService(prisma, audit);
    manual = new ManualDonationService(prisma, audit);
    campaign = new CampaignAdminService(prisma, audit, revalidation);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixtures = await seedFixtures(prisma, { campaignSlug: CAMPAIGN_SLUG });
    const e = await createTestAdmin(prisma, { email: 'editor@example.test', role: AdminRole.EDITOR });
    const a = await createTestAdmin(prisma, { email: 'accountant@example.test', role: AdminRole.ACCOUNTANT });
    editor = { id: e.id, email: e.email, role: e.role, displayName: null };
    accountant = { id: a.id, email: a.email, role: a.role, displayName: null };
  });

  async function donationWithContact(): Promise<string> {
    const donation = await createPendingDonation(prisma, fixtures, { regionId: fixtures.bashkortostanId });
    await prisma.donationContact.create({
      data: { donationId: donation.id, phoneE164: PHONE, fullName: FULL_NAME, personalDataConsentAt: new Date() },
    });

    return donation.id;
  }

  test('редактор видит маску ПДн, бухгалтер — данные', async () => {
    // Arrange
    await donationWithContact();

    // Act
    const forEditor = await query.list(filters(), editor);
    const forAccountant = await query.list(filters(), accountant);

    // Assert
    expect(forEditor.items[0]?.contact).toMatchObject({ fullName: PII_MASK, phone: PII_MASK });
    expect(forEditor.items[0]?.contactMasked).toBe(true);
    expect(JSON.stringify(forEditor)).not.toMatch(/7999|Усман/);
    expect(forAccountant.items[0]?.contact).toMatchObject({ fullName: FULL_NAME, phone: PHONE });
    expect(forAccountant.items[0]?.contactMasked).toBe(false);
  });

  test('редактор не может искать по ПДн, бухгалтер может', async () => {
    // Arrange
    await donationWithContact();

    // Act
    const byEditor = await query.list(filters({ q: 'Усман' }), editor);
    const byAccountant = await query.list(filters({ q: '1234567' }), accountant);

    // Assert
    expect(byEditor.total).toBe(0);
    expect(byAccountant.total).toBe(1);
  });

  test('фильтры по статусу, сумме и региону', async () => {
    // Arrange
    const paid = await createPendingDonation(prisma, fixtures, { amountKopecks: 50_000n });
    await markPaid(prisma, paid.id, 50_000n);
    await createPendingDonation(prisma, fixtures, { regionId: fixtures.bashkortostanId });

    // Act & Assert
    expect((await query.list(filters({ status: 'paid' }), editor)).total).toBe(1);
    expect((await query.list(filters({ minKopecks: '20000' }), editor)).total).toBe(1);
    expect((await query.list(filters({ regionSlug: '02' }), editor)).total).toBe(1);
    expect((await query.list(filters({ q: String((await prisma.donation.findUniqueOrThrow({ where: { id: paid.id } })).invoiceNo) }), editor)).total).toBe(1);
  });

  test('ручное поступление двигает сумму сбора, цель месяца и пишет журнал', async () => {
    // Act
    const result = await manual.create(
      {
        idempotencyKey: randomUUID(),
        amountKopecks: '150000',
        method: 'cash',
        comment: 'Наличные, пятничный намаз',
        paidAt: TEST_PAID_AT.toISOString(),
        regionSlug: '02',
      },
      accountant,
      META,
    );

    // Assert
    const stats = await prisma.campaignStats.findUniqueOrThrow({ where: { campaignId: fixtures.campaignId } });
    const month = await prisma.campaignMonthlyGoal.findFirstOrThrow({ where: { campaignId: fixtures.campaignId } });
    const region = await prisma.regionStats.findUniqueOrThrow({ where: { regionId: fixtures.bashkortostanId } });
    expect(result.applied).toBe(true);
    expect(stats.paidTotalKopecks).toBe(150_000n);
    expect(month.collectedKopecks).toBe(150_000n);
    expect(region.paidTotalKopecks).toBe(150_000n);
    expect(await prisma.auditLog.count({ where: { action: 'donation.manual_create', entityId: result.orderId } })).toBe(1);
  });

  test('повтор с тем же ключом не задваивает сумму; другой суммой — 409', async () => {
    // Arrange
    const dto = { idempotencyKey: randomUUID(), amountKopecks: '10000', method: 'cash' as const, comment: 'Ящик' };
    const first = await manual.create(dto, editor, META);

    // Act
    const second = await manual.create(dto, editor, META);

    // Assert
    const stats = await prisma.campaignStats.findUniqueOrThrow({ where: { campaignId: fixtures.campaignId } });
    expect(second).toMatchObject({ orderId: first.orderId, applied: false });
    expect(stats.paidTotalKopecks).toBe(10_000n);
    expect(stats.paidCount).toBe(1);
    await expect(manual.create({ ...dto, amountKopecks: '20000' }, editor, META)).rejects.toThrow(ConflictException);
  });

  test('ручное поступление: будущая дата, подпись анонима и лишний ноль отклоняются', async () => {
    // Arrange
    const base = { idempotencyKey: randomUUID(), amountKopecks: '10000', method: 'cash' as const, comment: 'Ящик' };

    // Act & Assert
    await expect(manual.create({ ...base, paidAt: '2099-01-01T00:00:00.000Z' }, editor, META)).rejects.toThrow(BadRequestException);
    await expect(manual.create({ ...base, donorName: 'Имя' }, editor, META)).rejects.toThrow(BadRequestException);
    await expect(manual.create({ ...base, amountKopecks: '999999999999' }, editor, META)).rejects.toThrow(BadRequestException);
    expect(await prisma.donation.count()).toBe(0);
  });

  test('CSV: BOM, разделитель «;», ПДн для бухгалтера и запись в журнале', async () => {
    // Arrange
    await donationWithContact();
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Act
    await query.exportCsv(filters(), accountant, META, out);

    // Assert
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text.startsWith('﻿Номер счёта;')).toBe(true);
    expect(text).toContain(`'${PHONE}`);
    expect(text).toContain('100,00');
    expect(text.trim().split('\r\n')).toHaveLength(2);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'donation.export' } });
    expect(entry.after).toMatchObject({ rows: 1 });
  });

  test('новая цель месяца сразу учитывает уже оплаченные донаты периода', async () => {
    // Arrange: донат в октябре, цели на октябрь ещё нет
    const donation = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, donation.id, TEST_DONATION_KOPECKS, new Date('2026-10-05T09:00:00.000Z'));

    // Act
    const goal = await campaign.createMonthlyGoal(
      { periodStart: '2026-10-01', periodEnd: '2026-10-31', goalKopecks: '100000000' },
      editor,
      META,
    );
    const later = await createPendingDonation(prisma, fixtures);
    await markPaid(prisma, later.id, TEST_DONATION_KOPECKS, new Date('2026-10-06T09:00:00.000Z'));

    // Assert
    const stored = await prisma.campaignMonthlyGoal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(goal.collectedKopecks).toBe(TEST_DONATION_KOPECKS.toString());
    expect(stored.collectedKopecks).toBe(TEST_DONATION_KOPECKS * 2n);
  });

  test('пересекающийся период — 409', async () => {
    // Act: сентябрь уже занят тестовой целью
    const act = campaign.createMonthlyGoal(
      { periodStart: '2026-09-15', periodEnd: '2026-10-15', goalKopecks: '100000' },
      editor,
      META,
    );

    // Assert
    await expect(act).rejects.toThrow(ConflictException);
  });

  test('смена цели сбора видна в витрине и в журнале', async () => {
    // Act
    const updated = await campaign.updateGoal({ goalKopecks: '30000000000' }, editor, META);

    // Assert
    expect(updated.goalKopecks).toBe('30000000000');
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'campaign.update_goal' } });
    expect(entry.after).toEqual({ goalKopecks: '30000000000' });
  });
});
