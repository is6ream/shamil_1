/**
 * Типы ответов и тел API админки — строго по `docs/admin/API.md`.
 *
 * Одно место на весь контракт: экраны импортируют отсюда, а не описывают
 * ответы у себя. Деньги — всегда строки копеек, время — ISO-8601 UTC,
 * даты без времени — `ГГГГ-ММ-ДД`.
 */

import type { AdminRole } from "./roles";

/** Общая форма постраничных ответов (§6). */
export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/* ── §5 Пользователи ─────────────────────────────────────────────────── */

export interface AdminUserRecord {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly displayName: string | null;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  /** Вход заблокирован до этого момента после 5 неудач. */
  readonly lockedUntil: string | null;
  readonly createdAt: string;
}

export interface CreateUserBody {
  readonly email: string;
  readonly password: string;
  readonly role: AdminRole;
  readonly displayName?: string;
}

export interface UpdateUserBody {
  readonly role?: AdminRole;
  readonly displayName?: string | null;
  readonly isActive?: boolean;
}

/* ── §6 Журнал ───────────────────────────────────────────────────────── */

export interface AuditActor {
  readonly type: "user" | "system";
  readonly id: string | null;
  readonly role: AdminRole | null;
  readonly label: string | null;
}

export interface AuditEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: AuditActor;
  readonly action: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/* ── §7 Медиатека ────────────────────────────────────────────────────── */

export interface ImageUrls {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
}

export interface MediaAsset {
  readonly id: string;
  readonly url: string;
  readonly urls: ImageUrls;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly altText: string | null;
  readonly originalName: string | null;
  readonly createdAt: string;
}

export type MediaUsageType =
  | "gallery_item"
  | "video_link"
  | "construction_stage"
  | "news_post"
  | "content_block";

export interface MediaUsage {
  readonly entityType: MediaUsageType;
  readonly entityId: string;
  readonly label: string;
}

/** Картинка в ответах галереи, видео, этапов, новостей. */
export interface PublicImage {
  readonly url: string;
  readonly urls: ImageUrls;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

/* ── §8 Галерея ──────────────────────────────────────────────────────── */

export interface AdminGalleryItem {
  readonly id: string;
  readonly mediaAssetId: string | null;
  readonly image: PublicImage | null;
  readonly url: string;
  readonly caption: string | null;
  readonly altText: string | null;
  /** `ГГГГ-ММ-ДД`; на сайте — «июнь 2026». */
  readonly takenOn: string | null;
  readonly isPublished: boolean;
  readonly sortOrder: number;
  readonly updatedAt: string;
}

export interface GalleryItemBody {
  readonly mediaAssetId?: string;
  readonly caption?: string | null;
  readonly altText?: string | null;
  readonly takenOn?: string | null;
  readonly isPublished?: boolean;
}

/* ── §9 Видео ────────────────────────────────────────────────────────── */

export type VideoProvider = "vk" | "rutube" | "youtube";

export interface AdminVideo {
  readonly id: string;
  readonly provider: VideoProvider;
  readonly embedUrl: string;
  readonly sourceUrl: string;
  readonly title: string | null;
  readonly poster: PublicImage | null;
  readonly posterMediaId: string | null;
  readonly isPublished: boolean;
  readonly sortOrder: number;
  readonly updatedAt: string;
}

export interface VideoBody {
  readonly url?: string;
  readonly title?: string | null;
  readonly posterMediaId?: string | null;
  readonly isPublished?: boolean;
}

/* ── §10 Контент ─────────────────────────────────────────────────────── */

export interface HeroBlock {
  readonly badge: string;
  readonly title: string;
  readonly lede: string;
  readonly ledeShort: string;
  readonly trust: readonly string[];
  readonly renderMediaId: string | null;
  readonly renderCaption: string;
  readonly helpButton: string;
}

export interface AboutFact {
  readonly value: string | null;
  readonly unit: string | null;
  readonly label: string | null;
}

export interface AboutBlock {
  readonly eyebrow: string;
  readonly title: string;
  readonly text: string | null;
  readonly facadeMediaId: string | null;
  readonly facadeCaption: string;
  readonly facts: readonly AboutFact[];
}

export interface RequisitesBlock {
  readonly accountNumber: string | null;
  readonly bankName: string | null;
  readonly bik: string | null;
  readonly correspondentAccount: string | null;
  readonly kpp: string | null;
  readonly sbpQrMediaId: string | null;
}

export interface ContactsBlock {
  readonly phone: string | null;
  readonly email: string | null;
  readonly telegramChannel: string | null;
  readonly mosqueAddress: string | null;
}

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface FaqBlock {
  readonly items: readonly FaqItem[];
}

export interface ContentBlocks {
  readonly hero: HeroBlock;
  readonly about: AboutBlock;
  readonly requisites: RequisitesBlock;
  readonly contacts: ContactsBlock;
  readonly faq: FaqBlock;
}

export type ContentKey = keyof ContentBlocks;

export interface AdminBlock<K extends ContentKey = ContentKey> {
  readonly key: K;
  readonly data: ContentBlocks[K];
  readonly updatedAt: string;
  readonly updatedById: string | null;
}

/* ── §11 Этапы ───────────────────────────────────────────────────────── */

export type StageStatus = "done" | "current" | "upcoming";

export interface AdminStage {
  readonly id: string;
  readonly title: string;
  readonly status: StageStatus;
  readonly amountKopecks: string | null;
  readonly budgetKopecks: string | null;
  readonly spentKopecks: string | null;
  readonly description: string | null;
  readonly photos: readonly PublicImage[];
  readonly photoMediaIds: readonly string[];
  readonly sortOrder: number;
  readonly updatedAt: string;
}

export interface StageBody {
  readonly title: string;
  readonly description: string | null;
  readonly status: StageStatus;
  readonly budgetKopecks: string | null;
  readonly spentKopecks: string | null;
  readonly photoMediaIds: readonly string[];
}

/* ── §12 Новости ─────────────────────────────────────────────────────── */

export type NewsStatus = "draft" | "published";

export interface AdminNewsPost {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly bodyMarkdown: string;
  readonly coverMediaId: string | null;
  readonly cover: PublicImage | null;
  readonly status: NewsStatus;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewsBody {
  readonly title?: string;
  readonly slug?: string;
  readonly excerpt?: string | null;
  readonly bodyMarkdown?: string;
  readonly coverMediaId?: string | null;
  readonly status?: NewsStatus;
}

/* ── §13 Пожертвования ───────────────────────────────────────────────── */

export type DonationStatus = "pending" | "paid" | "failed";

/** Способы ручного поступления и подтверждения перевода. */
export const MANUAL_METHODS = ["cash", "bank_transfer", "sbp"] as const;

export type ManualMethod = (typeof MANUAL_METHODS)[number];

export interface DonationUtmRecord {
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  readonly content: string | null;
  readonly term: string | null;
}

export interface DonationContact {
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly consentAt: string | null;
}

export interface AdminDonation {
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
  readonly regionSource: "link" | "form" | "admin" | null;
  readonly isAnonymous: boolean;
  readonly donorName: string | null;
  readonly utm: DonationUtmRecord;
  readonly referrer: string | null;
  readonly landingPage: string | null;
  readonly adminComment: string | null;
  readonly contact: DonationContact | null;
  /** `true` — у EDITOR вместо значений `•••`. */
  readonly contactMasked: boolean;
}

export interface PaymentEventRecord {
  readonly id: string;
  readonly provider: string;
  readonly status: string;
  readonly amountKopecks: string | null;
  readonly receivedAt: string;
  /** `null` — событие ничего не изменило (повтор). */
  readonly appliedAt: string | null;
}

export interface AdminDonationDetails extends AdminDonation {
  readonly events: readonly PaymentEventRecord[];
}

export interface ManualDonationBody {
  readonly idempotencyKey: string;
  readonly amountKopecks: string;
  readonly method: ManualMethod;
  readonly comment: string;
  readonly paidAt?: string;
  readonly regionSlug?: string;
  readonly isAnonymous: boolean;
  readonly donorName?: string;
}

export interface ManualDonationResult {
  readonly orderId: string;
  readonly invoiceNo: number;
  readonly status: "paid";
  readonly paidAmountKopecks: string;
  readonly paidAt: string;
  readonly applied: boolean;
}

export interface ConfirmDonationBody {
  readonly amountKopecks?: string;
  readonly method?: ManualMethod;
}

export interface ConfirmDonationResult {
  readonly orderId: string;
  readonly status: "paid";
  readonly paidAmountKopecks: string;
  readonly paidAt: string;
  readonly applied: boolean;
}

/* ── §14 Сбор и цели ─────────────────────────────────────────────────── */

export interface MonthlyGoalRecord {
  readonly id: string;
  /** `ГГГГ-ММ-ДД` по Москве, включительно. */
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly goalKopecks: string;
  readonly collectedKopecks: string;
}

export interface CampaignAdmin {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly currency: string;
  readonly goalKopecks: string;
  readonly minDonationKopecks: string;
  readonly collectedKopecks: string;
  readonly donationsCount: number;
  readonly monthlyGoals: readonly MonthlyGoalRecord[];
}

export interface MonthlyGoalBody {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly goalKopecks: string;
}

/* ── §15 Дашборд ─────────────────────────────────────────────────────── */

export interface Dashboard {
  readonly campaign: {
    readonly goalKopecks: string;
    readonly collectedKopecks: string;
    readonly donationsCount: number;
    readonly lastPaidAt: string | null;
  };
  readonly monthlyGoal: {
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly goalKopecks: string;
    readonly collectedKopecks: string;
  } | null;
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly totalKopecks: string;
    readonly count: number;
    readonly averageKopecks: string;
  };
  readonly byDay: readonly { readonly date: string; readonly totalKopecks: string; readonly count: number }[];
  readonly byUtm: readonly {
    readonly source: string | null;
    readonly medium: string | null;
    readonly campaign: string | null;
    readonly totalKopecks: string;
    readonly count: number;
  }[];
  readonly byMethod: readonly { readonly method: string | null; readonly totalKopecks: string; readonly count: number }[];
  readonly recent: readonly {
    readonly id: string;
    readonly invoiceNo: number;
    readonly paidAt: string;
    readonly paidAmountKopecks: string;
    readonly provider: string;
    readonly method: string | null;
    readonly regionName: string | null;
    readonly donorName: string | null;
  }[];
}

/* ── §16 Публичный справочник регионов (для фильтров и форм) ─────────── */

export interface RegionOption {
  readonly slug: string;
  readonly code: string;
  readonly name: string;
  readonly type: "country" | "subject";
}
