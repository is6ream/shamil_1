import type { Prisma } from '../generated/prisma/client';
import type { DonationStatus } from '../generated/prisma/enums';
import type { DonationFiltersDto } from './dto/donation-list.dto';

/**
 * Фильтры списка пожертвований → `where` Prisma. Один построитель на список
 * и на CSV: выгрузка обязана совпадать с тем, что админ видит на экране.
 */

/** Номер счёта: только цифры, в пределах int4. */
const INVOICE_QUERY = /^\d{1,10}$/;
const MAX_INVOICE = 2_147_483_647;

export function buildDonationWhere(filters: DonationFiltersDto, canSearchPersonalData: boolean): Prisma.DonationWhereInput {
  const and: Prisma.DonationWhereInput[] = [];

  if (filters.status !== undefined) {
    and.push({ status: filters.status });
  }

  if (filters.from !== undefined || filters.to !== undefined) {
    const range = {
      ...(filters.from === undefined ? {} : { gte: new Date(filters.from) }),
      ...(filters.to === undefined ? {} : { lt: new Date(filters.to) }),
    };

    and.push(filters.dateField === 'paid' ? { paidAt: range } : { createdAt: range });
  }

  if (filters.method !== undefined) {
    and.push({ method: filters.method });
  }

  if (filters.provider !== undefined) {
    and.push({ provider: filters.provider });
  }

  if (filters.minKopecks !== undefined || filters.maxKopecks !== undefined) {
    const range = {
      ...(filters.minKopecks === undefined ? {} : { gte: BigInt(filters.minKopecks) }),
      ...(filters.maxKopecks === undefined ? {} : { lte: BigInt(filters.maxKopecks) }),
    };

    // У оплаченного сравнивается фактическая сумма, у прочих — сумма заказа.
    and.push({ OR: [{ paidAmountKopecks: range }, { paidAmountKopecks: null, amountKopecks: range }] });
  }

  if (filters.utmSource !== undefined) {
    and.push({ utmSource: filters.utmSource });
  }

  if (filters.utmMedium !== undefined) {
    and.push({ utmMedium: filters.utmMedium });
  }

  if (filters.utmCampaign !== undefined) {
    and.push({ utmCampaign: filters.utmCampaign });
  }

  if (filters.regionSlug !== undefined) {
    and.push({ region: { slug: filters.regionSlug } });
  }

  const search = filters.q?.trim();

  if (search !== undefined && search.length > 0) {
    and.push({ OR: searchConditions(search, canSearchPersonalData) });
  }

  return and.length === 0 ? {} : { AND: and };
}

function searchConditions(search: string, canSearchPersonalData: boolean): Prisma.DonationWhereInput[] {
  const conditions: Prisma.DonationWhereInput[] = [{ donorName: { contains: search, mode: 'insensitive' } }];

  if (INVOICE_QUERY.test(search) && Number(search) <= MAX_INVOICE) {
    conditions.push({ invoiceNo: Number(search) });
  }

  if (canSearchPersonalData) {
    conditions.push({ contact: { fullName: { contains: search, mode: 'insensitive' } } });

    const digits = search.replace(/\D/g, '');

    if (digits.length >= 4) {
      conditions.push({ contact: { phoneE164: { contains: digits } } });
    }
  }

  return conditions;
}

export function buildDonationOrder(filters: DonationFiltersDto): Prisma.DonationOrderByWithRelationInput[] {
  const order = filters.order;

  switch (filters.sort) {
    case 'paidAt':
      return [{ paidAt: { sort: order, nulls: 'last' } }, { id: order }];
    case 'amount':
      return [{ paidAmountKopecks: { sort: order, nulls: 'last' } }, { amountKopecks: order }, { id: order }];
    case 'createdAt':
      return [{ createdAt: order }, { id: order }];
    default: {
      const unknown: never = filters.sort;
      throw new Error(`Неизвестная сортировка: ${String(unknown)}`);
    }
  }
}

export const DONATION_ADMIN_SELECT = {
  id: true,
  invoiceNo: true,
  status: true,
  amountKopecks: true,
  paidAmountKopecks: true,
  chargedCurrency: true,
  provider: true,
  method: true,
  createdAt: true,
  paidAt: true,
  regionSource: true,
  isAnonymous: true,
  donorName: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
  referrer: true,
  landingPage: true,
  adminComment: true,
  region: { select: { slug: true, name: true } },
  contact: { select: { fullName: true, phoneE164: true, personalDataConsentAt: true } },
} as const satisfies Prisma.DonationSelect;

export type DonationAdminRow = Prisma.DonationGetPayload<{ select: typeof DONATION_ADMIN_SELECT }>;

/** Маска ПДн для ролей без доступа (D-06): видно, что поле заполнено, но не что в нём. */
export const PII_MASK = '•••';

export interface DonationContactResponse {
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly consentAt: string | null;
}

export interface AdminDonationResponse {
  readonly id: string;
  readonly invoiceNo: number;
  readonly status: DonationStatus;
  readonly amountKopecks: string;
  readonly paidAmountKopecks: string | null;
  readonly currency: string;
  readonly provider: string;
  readonly method: string | null;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly region: { readonly slug: string; readonly name: string } | null;
  readonly regionSource: string | null;
  readonly isAnonymous: boolean;
  readonly donorName: string | null;
  readonly utm: {
    readonly source: string | null;
    readonly medium: string | null;
    readonly campaign: string | null;
    readonly content: string | null;
    readonly term: string | null;
  };
  readonly referrer: string | null;
  readonly landingPage: string | null;
  readonly adminComment: string | null;
  /** `null` — донатер не оставлял ни имени для сверки, ни телефона. */
  readonly contact: DonationContactResponse | null;
  /** `true` — ПДн скрыты маской для этой роли. */
  readonly contactMasked: boolean;
}

function mask(value: string | null): string | null {
  return value === null ? null : PII_MASK;
}

export function toAdminDonation(row: DonationAdminRow, canSeePersonalData: boolean): AdminDonationResponse {
  const contact =
    row.contact === null
      ? null
      : {
          fullName: canSeePersonalData ? row.contact.fullName : mask(row.contact.fullName),
          phone: canSeePersonalData ? row.contact.phoneE164 : mask(row.contact.phoneE164),
          consentAt: row.contact.personalDataConsentAt.toISOString(),
        };

  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    status: row.status,
    amountKopecks: row.amountKopecks.toString(),
    paidAmountKopecks: row.paidAmountKopecks?.toString() ?? null,
    currency: row.chargedCurrency,
    provider: row.provider,
    method: row.method,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    region: row.region,
    regionSource: row.regionSource,
    isAnonymous: row.isAnonymous,
    donorName: row.donorName,
    utm: {
      source: row.utmSource,
      medium: row.utmMedium,
      campaign: row.utmCampaign,
      content: row.utmContent,
      term: row.utmTerm,
    },
    referrer: row.referrer,
    landingPage: row.landingPage,
    adminComment: row.adminComment,
    contact,
    contactMasked: !canSeePersonalData && contact !== null,
  };
}
