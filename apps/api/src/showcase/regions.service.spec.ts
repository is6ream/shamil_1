import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { RegionsService } from './regions.service';

// Query-contract unit test; this is not PostgreSQL validation.
test('returns all 26 rows; preserves the production query, mapper and emptyCount', async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({
    paidTotalKopecks: BigInt(26 - Math.floor(index / 2)) * 10000n,
    paidCount: index + 1,
    region: { slug: `qa-${index}`, name: `QA ${String(index).padStart(2, '0')}`, flagUrl: null },
  }));
  const findMany = jest.fn(async (query: { take?: number }) => rows.slice(0, query.take));
  const count = jest.fn().mockResolvedValue(7);
  const module = await Test.createTestingModule({ providers: [RegionsService,
    { provide: PrismaService, useValue: { regionStats: { findMany, count } } },
  ] }).compile();
  const result = await module.get(RegionsService).getTopRegions();
  expect(findMany).toHaveBeenCalledWith({
    where: { paidTotalKopecks: { gt: 0n }, region: { isRanked: true, isActive: true } },
    orderBy: [{ paidTotalKopecks: 'desc' }, { region: { name: 'asc' } }],
    select: { paidTotalKopecks: true, paidCount: true,
      region: { select: { slug: true, name: true, flagUrl: true } } },
  });
  expect(count).toHaveBeenCalledWith({ where: { paidTotalKopecks: 0n, region: { isRanked: true, isActive: true } } });
  expect(result).toEqual({ items: rows.map(row => ({ ...row.region,
    donorsCount: row.paidCount, paidTotalKopecks: row.paidTotalKopecks.toString() })), emptyCount: 7 });
  expect(result.items).toHaveLength(26);
  await module.close();
});
