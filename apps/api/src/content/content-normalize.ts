import type {
  AboutBlock,
  ContactsBlock,
  ContentBlockKey,
  ContentBlocks,
  FaqBlock,
  HeroBlock,
  ProjectFact,
  RequisitesBlock,
} from './content.types';

/**
 * Приведение JSON блока к его типу. Применяется и к телу запроса (после DTO),
 * и к тому, что лежит в БД: необязательные поля всегда явно `null`, лишние
 * ключи отбрасываются. В ответ API уходит только то, что описано в типе.
 */

type Json = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function hero(raw: Json): HeroBlock {
  return {
    badge: str(raw.badge),
    title: str(raw.title),
    lede: str(raw.lede),
    ledeShort: str(raw.ledeShort),
    trust: list(raw.trust).filter((item): item is string => typeof item === 'string'),
    renderMediaId: strOrNull(raw.renderMediaId),
    renderCaption: str(raw.renderCaption),
    helpButton: str(raw.helpButton),
  };
}

function fact(value: unknown): ProjectFact {
  const raw = asRecord(value);

  return { value: strOrNull(raw.value), unit: strOrNull(raw.unit), label: strOrNull(raw.label) };
}

function about(raw: Json): AboutBlock {
  return {
    eyebrow: str(raw.eyebrow),
    title: str(raw.title),
    text: strOrNull(raw.text),
    facadeMediaId: strOrNull(raw.facadeMediaId),
    facadeCaption: str(raw.facadeCaption),
    facts: list(raw.facts).map(fact),
  };
}

function requisites(raw: Json): RequisitesBlock {
  return {
    accountNumber: strOrNull(raw.accountNumber),
    bankName: strOrNull(raw.bankName),
    bik: strOrNull(raw.bik),
    correspondentAccount: strOrNull(raw.correspondentAccount),
    kpp: strOrNull(raw.kpp),
    sbpQrMediaId: strOrNull(raw.sbpQrMediaId),
  };
}

function contacts(raw: Json): ContactsBlock {
  return {
    phone: strOrNull(raw.phone),
    email: strOrNull(raw.email),
    telegramChannel: strOrNull(raw.telegramChannel),
    mosqueAddress: strOrNull(raw.mosqueAddress),
  };
}

function faq(raw: Json): FaqBlock {
  return {
    items: list(raw.items).map((item) => {
      const entry = asRecord(item);

      return { question: str(entry.question), answer: str(entry.answer) };
    }),
  };
}

const NORMALIZERS: { readonly [K in ContentBlockKey]: (raw: Json) => ContentBlocks[K] } = {
  hero,
  about,
  requisites,
  contacts,
  faq,
};

export function normalizeBlock<K extends ContentBlockKey>(key: K, value: unknown): ContentBlocks[K] {
  return NORMALIZERS[key](asRecord(value));
}
