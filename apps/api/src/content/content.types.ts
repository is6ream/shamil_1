import type { PublicImage } from '../media/media-urls';

export const CONTENT_BLOCK_KEYS = ['hero', 'about', 'requisites', 'contacts', 'faq'] as const;

export type ContentBlockKey = (typeof CONTENT_BLOCK_KEYS)[number];

/** Блоки в том виде, в каком они лежат в `content_block.data`. */
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

export interface ProjectFact {
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
  readonly facts: readonly ProjectFact[];
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

export interface FaqBlock {
  readonly items: readonly { readonly question: string; readonly answer: string }[];
}

export interface ContentBlocks {
  readonly hero: HeroBlock;
  readonly about: AboutBlock;
  readonly requisites: RequisitesBlock;
  readonly contacts: ContactsBlock;
  readonly faq: FaqBlock;
}

/** Поля блока, где лежат id файлов медиатеки. */
export const MEDIA_FIELDS: Readonly<Record<ContentBlockKey, readonly string[]>> = {
  hero: ['renderMediaId'],
  about: ['facadeMediaId'],
  requisites: ['sbpQrMediaId'],
  contacts: [],
  faq: [],
};

/** Публичные формы — с готовыми ссылками на картинки вместо id. */
export interface PublicHeroBlock extends HeroBlock {
  readonly renderUrl: string | null;
  readonly render: PublicImage | null;
}

export interface PublicAboutBlock extends AboutBlock {
  readonly facadeUrl: string | null;
  readonly facade: PublicImage | null;
}

export interface PublicRequisitesBlock extends RequisitesBlock {
  readonly sbpQrUrl: string | null;
}

export interface PublicContentResponse {
  readonly hero: PublicHeroBlock | null;
  readonly about: PublicAboutBlock | null;
  readonly requisites: PublicRequisitesBlock | null;
  readonly contacts: ContactsBlock | null;
  readonly faq: FaqBlock | null;
  /** Последняя правка любого блока, ISO-8601; `null`, если блоков нет. */
  readonly updatedAt: string | null;
}

export interface AdminContentBlockResponse<K extends ContentBlockKey = ContentBlockKey> {
  readonly key: K;
  readonly data: ContentBlocks[K];
  readonly updatedAt: string;
  readonly updatedById: string | null;
}
