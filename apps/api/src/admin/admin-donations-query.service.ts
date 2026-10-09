import { once } from 'node:events';
import type { Writable } from 'node:stream';

import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { canSeePersonalData } from '../auth/roles';
import type { Page } from '../common/pagination';
import { pageArgs } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CSV_BOM, csvRow, formatExportDate, kopecksToRubles } from './csv';
import { DONATION_ADMIN_SELECT, buildDonationOrder, buildDonationWhere, toAdminDonation } from './donation-query';
import type { AdminDonationResponse, DonationAdminRow } from './donation-query';
import type { DonationFiltersDto } from './dto/donation-list.dto';

export interface DonationEventResponse {
  readonly id: string;
  readonly provider: string;
  readonly status: string;
  readonly amountKopecks: string | null;
  readonly receivedAt: string;
  /** `null` — событие ничего не изменило (повтор или запрещённый переход). */
  readonly appliedAt: string | null;
}

export interface AdminDonationDetailResponse extends AdminDonationResponse {
  readonly events: readonly DonationEventResponse[];
}

/** Строк CSV за один запрос к БД: выгрузка не держит всю таблицу в памяти. */
const EXPORT_BATCH = 500;

const CSV_HEADER = [
  'Номер счёта',
  'Создан (Уфа)',
  'Оплачен (Уфа)',
  'Статус',
  'Сумма заказа, ₽',
  'Оплачено, ₽',
  'Провайдер',
  'Способ',
  'Регион',
  'Анонимно',
  'Подпись',
  'Имя для сверки',
  'Телефон',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'Комментарий',
  'ID',
] as const;

function toCsvRow(row: DonationAdminRow): string {
  return csvRow([
    row.invoiceNo,
    formatExportDate(row.createdAt),
    formatExportDate(row.paidAt),
    row.status,
    kopecksToRubles(row.amountKopecks),
    kopecksToRubles(row.paidAmountKopecks),
    row.provider,
    row.method,
    row.region?.name ?? null,
    row.isAnonymous ? 'да' : 'нет',
    row.donorName,
    row.contact?.fullName ?? null,
    row.contact?.phoneE164 ?? null,
    row.utmSource,
    row.utmMedium,
    row.utmCampaign,
    row.utmContent,
    row.utmTerm,
    row.adminComment,
    row.id,
  ]);
}

@Injectable()
export class AdminDonationsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: DonationFiltersDto, viewer: AdminPrincipal): Promise<Page<AdminDonationResponse>> {
    const canSee = canSeePersonalData(viewer.role);
    const where = buildDonationWhere(filters, canSee);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        select: DONATION_ADMIN_SELECT,
        orderBy: buildDonationOrder(filters),
        ...pageArgs(filters),
      }),
      this.prisma.donation.count({ where }),
    ]);

    return { items: rows.map((row) => toAdminDonation(row, canSee)), total, page: filters.page, pageSize: filters.pageSize };
  }

  async get(id: string, viewer: AdminPrincipal): Promise<AdminDonationDetailResponse> {
    const row = await this.prisma.donation.findUnique({
      where: { id },
      select: {
        ...DONATION_ADMIN_SELECT,
        // Тело колбэка (payload) не отдаём: для карточки хватает статуса и суммы.
        events: {
          select: { id: true, provider: true, status: true, amountKopecks: true, receivedAt: true, appliedAt: true },
          orderBy: { receivedAt: 'asc' },
        },
      },
    });

    if (row === null) {
      throw new NotFoundException('Пожертвование не найдено');
    }

    return {
      ...toAdminDonation(row, canSeePersonalData(viewer.role)),
      events: row.events.map((event) => ({
        id: event.id,
        provider: event.provider,
        status: event.status,
        amountKopecks: event.amountKopecks?.toString() ?? null,
        receivedAt: event.receivedAt.toISOString(),
        appliedAt: event.appliedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Потоковая выгрузка CSV. Пачками по `EXPORT_BATCH` с курсором по id
   * в порядке сортировки списка; запись ждёт `drain`, если клиент читает медленно.
   * Выгрузка с ПДн фиксируется в журнале — кто и с какими фильтрами.
   */
  async exportCsv(filters: DonationFiltersDto, viewer: AdminPrincipal, meta: RequestMeta, out: Writable): Promise<void> {
    const where = buildDonationWhere(filters, canSeePersonalData(viewer.role));
    const orderBy = buildDonationOrder(filters);
    let cursor: string | undefined;
    let exported = 0;

    await write(out, CSV_BOM + csvRow(CSV_HEADER));

    for (;;) {
      const rows: DonationAdminRow[] = await this.prisma.donation.findMany({
        where,
        select: DONATION_ADMIN_SELECT,
        orderBy,
        take: EXPORT_BATCH,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });

      for (const row of rows) {
        await write(out, toCsvRow(row));
      }

      exported += rows.length;

      const last = rows[rows.length - 1];

      if (rows.length < EXPORT_BATCH || last === undefined) {
        break;
      }

      cursor = last.id;
    }

    out.end();

    await this.audit.record(undefined, {
      actor: userActor(viewer),
      action: 'donation.export',
      entityType: 'donation',
      after: { rows: exported, filters: exportFilters(filters) },
      meta,
    });
  }
}

async function write(out: Writable, chunk: string): Promise<void> {
  if (!out.write(chunk)) {
    await once(out, 'drain');
  }
}

/** Фильтры для журнала: без строки поиска — в ней может быть имя или телефон. */
function exportFilters(filters: DonationFiltersDto): Prisma.InputJsonObject {
  return {
    status: filters.status ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
    dateField: filters.dateField,
    method: filters.method ?? null,
    provider: filters.provider ?? null,
    utmSource: filters.utmSource ?? null,
    utmMedium: filters.utmMedium ?? null,
    utmCampaign: filters.utmCampaign ?? null,
    regionSlug: filters.regionSlug ?? null,
    hasSearch: filters.q !== undefined && filters.q.trim().length > 0,
  };
}
