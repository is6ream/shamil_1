import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { createTestPrismaService, describeDatabase, resetDatabase, seedFixtures } from '../../database/testing/test-database';
import { RecurringManagementService } from './recurring-management.service';
import { keyHash } from './recurring.service';

describeDatabase('recurring owner management PostgreSQL', () => {
  let prisma: PrismaService;
  let service: RecurringManagementService;
  let campaignId: string;
  let owner: string;
  let other: string;
  const legacyKey = 'cd'.repeat(32);
  beforeAll(async () => {
    prisma = createTestPrismaService();
    const module = await Test.createTestingModule({providers:[RecurringManagementService,{provide:PrismaService,useValue:prisma}]}).compile();
    service = module.get(RecurringManagementService);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    ({campaignId} = await seedFixtures(prisma));
    owner = (await prisma.donorIdentity.create({data:{emailNormalized:randomUUID()+'@example.test',emailVerifiedAt:new Date()}})).id;
    other = (await prisma.donorIdentity.create({data:{emailNormalized:randomUUID()+'@example.test',emailVerifiedAt:new Date()}})).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const legacy = () => prisma.recurringSubscription.create({data:{
    keyHash:keyHash(legacyKey),merchantId:'synthetic',frequency:'monthly',termsVersion:'2026-11-06',previewDate:'2026-12-16',
    firstDonation:{create:{campaignId,amountKopecks:10000n,provider:'robokassa'}},
  }});
  it('does not attach ownerless legacy data when a verified identity exists',async () => {
    const sub=await legacy();
    expect((await service.list(owner)).items).toEqual([]);
    await expect(service.detail(owner,sub.id)).rejects.toMatchObject({status:404});
    expect((await prisma.recurringSubscription.findUniqueOrThrow({where:{id:sub.id}})).ownerId).toBeNull();
  });
  it('serializes competing explicit claims and keeps consent unverified',async () => {
    const sub=await legacy();
    const results=await Promise.allSettled([service.claim(owner,legacyKey),service.claim(other,legacyKey)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const stored=await prisma.recurringSubscription.findUniqueOrThrow({where:{id:sub.id}});
    expect(stored.consentVerifiedAt).toBeNull(); expect(stored.state).toBe('pending'); expect(stored.nextAt).toBeNull();
    if (stored.ownerId === null) throw new Error('Expected claimed owner');
    expect((await service.claim(stored.ownerId,legacyKey)).claimed).toBe(false);
    const loser=stored.ownerId===owner?other:owner;
    await expect(service.claim(loser,legacyKey)).rejects.toMatchObject({status:409});
  });
  it('cancels under owner lock without exposing foreign data or changing first cancellation time',async () => {
    const sub=await legacy(); await service.claim(owner,legacyKey);
    await expect(service.cancel(other,sub.id)).rejects.toMatchObject({status:404});
    const first=await service.cancel(owner,sub.id);const repeat=await service.cancel(owner,sub.id);
    expect(first.state).toBe('cancelled');expect(repeat.cancelledAt).toBe(first.cancelledAt);expect(repeat.nextAt).toBeNull();
  });
});
