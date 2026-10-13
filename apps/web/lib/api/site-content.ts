/**
 * Контент сайта из админки (API.md §16): тексты, ход стройки, видео, новости.
 *
 * Правило: пока в админке нет данных, сайт выглядит как раньше. Каждый блок
 * `/content`, равный `null`, заменяется текущим хардкодом (`lib/content.ts`,
 * `lib/organization.ts`); недоступный API — тоже хардкод (`withFallback`
 * на странице). Формы совпадают с `HERO`, `ABOUT`, `BANK_DETAILS` — компоненты
 * получают те же поля пропсами.
 *
 * Хадисы, слоган и юридические данные организации сюда не приходят (D-10).
 */

import { ABOUT, HERO } from "@/lib/content";
import type { ProjectFact } from "@/lib/content";
import { BANK_DETAILS, ORGANIZATION } from "@/lib/organization";
import type { BankDetails } from "@/lib/organization";

import { apiGet } from "./client";
import { FIXTURE_CONSTRUCTION } from "./showcase.fixtures";
import type { ConstructionTimeline } from "./types";

/** Тексты меняются редко — час; правка из админки сбрасывает кеш тегом сразу. */
const CONTENT_REVALIDATE_S = 3600;

/* ── Формы ответа API ────────────────────────────────────────────────── */

export interface PublicImage {
  readonly url: string;
  readonly urls: { readonly sm: string; readonly md: string; readonly lg: string };
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

interface ContentResponse {
  readonly hero: (Omit<HeroContent, "renderUrl"> & { readonly renderUrl: string | null }) | null;
  readonly about: (Omit<AboutContent, "facadeUrl"> & { readonly facadeUrl: string | null }) | null;
  readonly requisites: (Omit<BankDetails, "sbpQrUrl"> & { readonly sbpQrUrl: string | null }) | null;
  readonly contacts: ContactsContent | null;
}

/* ── Что получают компоненты ─────────────────────────────────────────── */

export interface HeroContent {
  readonly badge: string;
  readonly title: string;
  readonly lede: string;
  readonly ledeShort: string;
  readonly trust: readonly string[];
  readonly renderUrl: string | null;
  readonly renderCaption: string;
  readonly helpButton: string;
}

export interface AboutContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly text: string | null;
  readonly facadeUrl: string | null;
  readonly facadeCaption: string;
  readonly facts: readonly ProjectFact[];
}

export interface ContactsContent {
  readonly phone: string | null;
  readonly email: string | null;
  readonly telegramChannel: string | null;
  readonly mosqueAddress: string | null;
}

export interface SiteContent {
  readonly hero: HeroContent;
  readonly about: AboutContent;
  readonly bank: BankDetails;
  readonly contacts: ContactsContent;
}

/** Сайт без админки — ровно то, что сейчас в коде. */
export const FALLBACK_CONTENT: SiteContent = {
  hero: HERO,
  about: ABOUT,
  bank: BANK_DETAILS,
  contacts: {
    phone: ORGANIZATION.phone,
    email: ORGANIZATION.email,
    telegramChannel: ORGANIZATION.telegramChannel,
    mosqueAddress: ORGANIZATION.mosqueAddress,
  },
};

/** Поля блока явным списком: лишнее из ответа (id медиатеки и т. п.) в пропсы не идёт. */
export function toSiteContent(response: ContentResponse): SiteContent {
  const { hero, about, requisites, contacts } = response;

  return {
    hero:
      hero === null
        ? FALLBACK_CONTENT.hero
        : {
            badge: hero.badge,
            title: hero.title,
            lede: hero.lede,
            ledeShort: hero.ledeShort,
            trust: hero.trust,
            renderUrl: hero.renderUrl,
            renderCaption: hero.renderCaption,
            helpButton: hero.helpButton,
          },
    about:
      about === null
        ? FALLBACK_CONTENT.about
        : {
            eyebrow: about.eyebrow,
            title: about.title,
            text: about.text,
            facadeUrl: about.facadeUrl,
            facadeCaption: about.facadeCaption,
            // `unit: null` → без поля: так же, как факты хардкода (`unit?: string`).
            facts: about.facts.map((fact) => ({
              value: fact.value,
              label: fact.label,
              ...(fact.unit === null || fact.unit === undefined ? {} : { unit: fact.unit }),
            })),
          },
    bank:
      requisites === null
        ? FALLBACK_CONTENT.bank
        : {
            accountNumber: requisites.accountNumber,
            bankName: requisites.bankName,
            bik: requisites.bik,
            correspondentAccount: requisites.correspondentAccount,
            kpp: requisites.kpp,
            sbpQrUrl: requisites.sbpQrUrl,
          },
    contacts:
      contacts === null
        ? FALLBACK_CONTENT.contacts
        : {
            phone: contacts.phone,
            email: contacts.email,
            telegramChannel: contacts.telegramChannel,
            mosqueAddress: contacts.mosqueAddress,
          },
  };
}

export async function getSiteContent(): Promise<SiteContent> {
  const response = await apiGet<ContentResponse>("/content", { revalidate: CONTENT_REVALIDATE_S, tags: ["content"] });

  return toSiteContent(response);
}

/* ── Ход стройки ─────────────────────────────────────────────────────── */

interface ConstructionResponse {
  readonly updatedAt: string | null;
  readonly stages: ConstructionTimeline["stages"];
}

/**
 * Этапы из админки. Пока этапов нет (`updatedAt: null`) — фикстура макета,
 * как было до админки. Новые поля этапа (освоено, описание, фото) таймлайн
 * пока не выводит: новых секций без дизайна не добавляем.
 */
export async function getConstruction(): Promise<ConstructionTimeline> {
  const response = await apiGet<ConstructionResponse>("/construction", {
    revalidate: CONTENT_REVALIDATE_S,
    tags: ["stages"],
  });

  if (response.updatedAt === null || response.stages.length === 0) {
    return FIXTURE_CONSTRUCTION;
  }

  return {
    updatedAt: response.updatedAt,
    stages: response.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      status: stage.status,
      amountKopecks: stage.amountKopecks,
    })),
  };
}

/* ── Видео (D-13) ────────────────────────────────────────────────────── */

export interface PublicVideo {
  readonly id: string;
  readonly provider: "vk" | "rutube" | "youtube";
  /** Собран сервером по allowlist; в iframe — с sandbox. */
  readonly embedUrl: string;
  readonly sourceUrl: string;
  readonly title: string | null;
  readonly poster: PublicImage | null;
}

/** Опубликованные видео по порядку; первое заменяет заглушку «Видео с объекта». */
export function getVideos(): Promise<readonly PublicVideo[]> {
  return apiGet<readonly PublicVideo[]>("/video", { revalidate: CONTENT_REVALIDATE_S, tags: ["video"] });
}

/* ── Новости (D-12) ──────────────────────────────────────────────────── */

export interface NewsListItem {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly cover: PublicImage | null;
  readonly publishedAt: string;
}

export interface NewsArticle extends NewsListItem {
  readonly bodyMarkdown: string;
}

interface NewsPage {
  readonly items: readonly NewsListItem[];
  readonly total: number;
}

/** Последние опубликованные новости; пусто — блок на сайте не рисуется. */
export async function getLatestNews(limit = 10): Promise<readonly NewsListItem[]> {
  const page = await apiGet<NewsPage>(`/news?page=1&pageSize=${limit}`, {
    revalidate: CONTENT_REVALIDATE_S,
    tags: ["news"],
  });

  return page.items;
}

/** Новость по адресу; черновик или нет такой — `null` (страница отдаст 404). */
export async function getNewsArticle(slug: string): Promise<NewsArticle | null> {
  try {
    return await apiGet<NewsArticle>(`/news/${encodeURIComponent(slug)}`, {
      revalidate: CONTENT_REVALIDATE_S,
      tags: ["news"],
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      return null;
    }

    throw error;
  }
}
