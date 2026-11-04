import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { DonationStatus } from '../generated/prisma/enums';
import { localDateOf, yearBounds } from '../subscriptions/billing-calendar';
import { kindOf } from './dto/donor-donations.dto';
import type {
  DonorHistoryQueryDto,
  DonorHistoryResponse,
  TaxCertificateResponse,
} from './dto/donor-donations.dto';

/**
 * В истории — только завершённые платежи. Pending — это и брошенные на
 * странице банка заказы: показывать их «в обработке» значило бы пугать
 * человека платежами, которых не было.
 */
const SHOWN_STATUSES = [DonationStatus.paid, DonationStatus.failed];

interface Cursor {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/** Битый курсор — 400, а не первая страница: иначе «Загрузить ещё» показал бы дубли. */
export function decodeCursor(value: string): Cursor {
  const [iso, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');

  if (id === undefined || !UUID_PATTERN.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('cursor — значение nextCursor из прошлого ответа');
  }

  return { createdAt, id };
}

function toCertificate(row: {
  id: string;
  year: number;
  status: TaxCertificateResponse['status'];
  adminComment: string | null;
  createdAt: Date;
  doneAt: Date | null;
}): TaxCertificateResponse {
  return {
    id: row.id,
    year: row.year,
    status: row.status,
    adminComment: row.adminComment,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
  };
}

/**
 * «Моя помощь»: свои пожертвования по годам и заявки на справку для вычета.
 * Видны только донаты, сделанные после входа (`user_id`): ранние к кабинету
 * не привязываются — надёжного ключа человека в них нет.
 */
@Injectable()
export class DonorDonationsService {
  constructor(private readonly prisma: PrismaService) {}

  async history(donorId: string, query: DonorHistoryQueryDto, now: Date = new Date()): Promise<DonorHistoryResponse> {
    const donor = await this.prisma.donorUser.findUniqueOrThrow({
      where: { id: donorId },
      select: { timezone: true },
    });
    const currentYear = localDateOf(now, donor.timezone).year;
    const year = query.year ?? currentYear;
    const bounds = yearBounds(year, donor.timezone);
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const inYear: Prisma.DonationWhereInput = {
      userId: donorId,
      status: { in: SHOWN_STATUSES },
      createdAt: { gte: bounds.from, lt: bounds.to },
    };
    const page: Prisma.DonationWhereInput =
      cursor === null
        ? inYear
        : {
            AND: [
              inYear,
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ],
          };

    const [rows, total, first] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where: page,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: {
          id: true,
          createdAt: true,
          paidAt: true,
          amountKopecks: true,
          paidAmountKopecks: true,
          method: true,
          type: true,
          status: true,
        },
      }),
      this.prisma.donation.aggregate({
        where: { userId: donorId, status: DonationStatus.paid, paidAt: { gte: bounds.from, lt: bounds.to } },
        _sum: { paidAmountKopecks: true },
      }),
      this.prisma.donation.findFirst({
        where: { userId: donorId, status: { in: SHOWN_STATUSES } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1);
    const firstYear = first === null ? currentYear : localDateOf(first.createdAt, donor.timezone).year;

    return {
      year,
      yearTotalKopecks: (total._sum.paidAmountKopecks ?? 0n).toString(),
      years: Array.from({ length: Math.max(currentYear - firstYear, 0) + 1 }, (_, index) => currentYear - index),
      items: items.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
        amountKopecks: (row.paidAmountKopecks ?? row.amountKopecks).toString(),
        method: row.method,
        kind: kindOf(row.type),
        status: row.status,
      })),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
    };
  }

  async certificates(donorId: string): Promise<TaxCertificateResponse[]> {
    const rows = await this.prisma.taxCertificateRequest.findMany({
      where: { donorId },
      orderBy: { year: 'desc' },
    });

    return rows.map(toCertificate);
  }

  /**
   * Заявка на справку за год. Повторная — та же заявка, не дубль: бухгалтеру
   * не нужно разбирать пять одинаковых строк от нетерпеливого человека.
   * Год без успешных пожертвований — 400: справку подтверждать нечем.
   */
  async requestCertificate(donorId: string, year: number, now: Date = new Date()): Promise<TaxCertificateResponse> {
    const donor = await this.prisma.donorUser.findUniqueOrThrow({ where: { id: donorId }, select: { timezone: true } });

    if (year > localDateOf(now, donor.timezone).year) {
      throw new BadRequestException('year — справку можно запросить только за прошедший или текущий год');
    }

    const bounds = yearBounds(year, donor.timezone);
    const paid = await this.prisma.donation.count({
      where: { userId: donorId, status: DonationStatus.paid, paidAt: { gte: bounds.from, lt: bounds.to } },
    });

    if (paid === 0) {
      throw new BadRequestException(`За ${year} год успешных пожертвований в кабинете нет`);
    }

    const row = await this.prisma.taxCertificateRequest.upsert({
      where: { donorId_year: { donorId, year } },
      create: { donorId, year },
      update: {},
    });

    return toCertificate(row);
  }
}
