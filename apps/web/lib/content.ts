/**
 * Тексты главной (макет v2, docs/design/landing-v2) — одна точка правки.
 *
 * Юридические данные сюда не входят: они в lib/organization.ts.
 *
 * Правило проекта (CLAUDE.md, «Правила по контенту»): хадисы
 * и религиозные тексты не публикуются без выверки имамом. Формулировки
 * ниже взяты из макета как есть — не редактировать и не «улучшать».
 *
 * Плейсхолдеры макета в квадратных скобках ([ГОД], [S] м², [район…])
 * текстом для вёрстки не являются: неизвестное — `null` с TODO,
 * и компоненты такое значение не выводят.
 */

/** Якоря секций: шапка, мобильное меню и аккордеон ссылаются на них. */
export const SECTION_IDS = {
  donate: "donate",
  about: "o-proekte",
  construction: "hod-stroitelstva",
  reports: "otchety",
  share: "podelitsya",
  requisites: "rekvizity",
  contacts: "kontakty",
} as const;

export interface NavItem {
  readonly id: string;
  readonly label: string;
}

/** Пункты навигации шапки в порядке макета. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: SECTION_IDS.about, label: "О проекте" },
  { id: SECTION_IDS.construction, label: "Ход строительства" },
  { id: SECTION_IDS.reports, label: "Отчёты" },
  { id: SECTION_IDS.requisites, label: "Реквизиты" },
  { id: SECTION_IDS.contacts, label: "Контакты" },
];

export const BRAND = {
  name: "Мечеть Шамиль",
  tagline: "Сбор на строительство · Уфа",
} as const;

export const HERO = {
  badge: "Идёт сбор · г. Уфа",
  title: "Построим мечеть «Шамиль» вместе",
  lede:
    "Мечеть на 500 молящихся в Уфе. Каждый вклад — садака джария: награда за неё " +
    "записывается, пока в стенах мечети совершается поклонение.",
  ledeShort: "Мечеть на 500 молящихся в Уфе. Каждый вклад — садака джария.",
  trust: [
    "Официальная религиозная организация",
    "Отчёт по каждому этапу",
    "Комиссия уже включена",
  ],
  /** TODO(заказчик): рендер или фото мечети — `public/brand/render.webp`. */
  renderUrl: null as string | null,
  renderCaption: "Рендер мечети «Шамиль»",
  helpButton: "Помочь",
} as const;

export const COLLECTED = {
  label: "Собрано",
  updatedPrefix: "Обновлено",
} as const;

export const STATS = {
  collected: "собрано на стройку",
  donations: "пожертвований",
  regions: "регионов и стран",
  monthlyDonors: "человек помогают каждый месяц",
} as const;

export interface ProjectFact {
  readonly value: string | null;
  readonly unit?: string;
  readonly label: string | null;
}

export const ABOUT = {
  eyebrow: "О проекте",
  title: "Дом для махалли и для следующих поколений",
  /**
   * TODO(заказчик): 2–3 предложения от Усмана — кто инициатор, где участок,
   * почему району нужна мечеть и что в ней будет (намазы, уроки Корана для
   * детей и взрослых, ифтары). До ответа абзац не выводится.
   */
  text: null as string | null,
  /** TODO(заказчик): эскиз фасада — `public/brand/facade.webp`. */
  facadeUrl: null as string | null,
  facadeCaption: "Эскиз фасада",
  facts: [
    { value: "500", label: "молящихся вмещает мечеть" },
    /** TODO(заказчик): год планируемого открытия. */
    { value: null, label: "планируемое открытие" },
    /** TODO(заказчик): район, улица, дом. */
    { value: "г. Уфа", label: null },
    /** TODO(заказчик): площадь и здания комплекса (мечеть, тахаратхана…). */
    { value: null, unit: "м²", label: null },
  ] as readonly ProjectFact[],
} as const;

export const CONSTRUCTION = {
  eyebrow: "Ход строительства",
  title: "Куда идут пожертвования",
  status: {
    done: "Выполнено",
    current: "Идёт сейчас",
    upcoming: "Впереди",
  },
  videoCaption: "Видео с объекта",
  videoPlayLabel: "Смотреть видео со стройки",
  galleryLink: "Все фото и видео со стройки",
} as const;

/**
 * Видео со стройки. Не грузится до клика: сначала постер, по клику —
 * `<video controls autoplay>`.
 *
 * TODO(заказчик): файл видео и постер в `public/media/`.
 */
export const CONSTRUCTION_VIDEO = {
  posterUrl: null as string | null,
  src: null as string | null,
} as const;

/**
 * Хадис для полосы во всю ширину.
 *
 * TODO(имам): выверка текста и источника перед публикацией.
 */
export const HADITH_BAND = {
  arabic: "مَنْ بَنَى مَسْجِدًا يَبْتَغِي بِهِ وَجْهَ اللَّهِ بَنَى اللَّهُ لَهُ مِثْلَهُ فِي الْجَنَّةِ",
  translation: "«Кто построит мечеть ради Аллаха, тому Аллах построит дом в Раю»",
  source: "Сахих аль-Бухари, Сахих Муслим",
} as const;

export const REGIONS = {
  title: "География поддержки",
} as const;

export const FEED = {
  title: "Последние поступления",
  allReports: "Все отчёты",
  anonymous: "Анонимное пожертвование",
  showMore: "Показать ещё",
} as const;

export const SHARE = {
  /** TODO(имам): выверка текста и источника перед публикацией. */
  quote: "«Указавшему на благое — такая же награда, как и совершившему его»",
  lede: "Расскажите о сборе близким — это тоже вклад в строительство.",
  whatsapp: "Поделиться в WhatsApp",
  copyLink: "Скопировать ссылку на сбор",
  copied: "Ссылка скопирована",
  native: "Поделиться",
} as const;

export const REQUISITES = {
  title: "Перевод по реквизитам",
  pending: "Уточняется",
  copied: "Скопировано",
} as const;

export const DOCUMENTS = {
  title: "Документы",
  pdf: "PDF",
  soon: "скоро",
} as const;

export const MOBILE_SECTIONS = {
  construction: "Куда идут пожертвования",
  reports: "Отчёты и поступления",
  requisites: "Реквизиты для перевода",
  share: "Поделиться сбором",
} as const;

export const FOOTER = {
  contacts: "Контакты",
  info: "Информация",
  imamPrefix: "Имам —",
  telegramPrefix: "Telegram-канал",
  copyright: "© 2026 Мечеть «Шамиль», Уфа",
} as const;

export const MOBILE_BAR = {
  of: "из",
  donate: "Пожертвовать",
} as const;

/** Служебные страницы, на которые ссылаются футер и форма. */
export const PAGES = {
  privacy: { href: "/privacy", title: "Политика конфиденциальности" },
  cookie: { href: "/cookie", title: "Использование cookie" },
  consent: { href: "/soglasie", title: "Согласие на обработку персональных данных" },
  paymentTerms: { href: "/usloviya-oplaty", title: "Условия оплаты" },
  reports: { href: "/otchety", title: "Отчёты о расходах" },
  gallery: { href: "/galereya", title: "Фото и видео со стройки" },
} as const;

/** Заглушка для юридических страниц до готового текста. */
export const PAGE_PENDING_TEXT = "Текст готовится и появится здесь в ближайшее время.";
