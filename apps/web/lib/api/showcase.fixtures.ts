/**
 * Демонстрационные данные витрины.
 *
 * ВСЕ ЦИФРЫ ЗДЕСЬ ВЫДУМАНЫ и взяты из прототипа дня 4
 * (docs/design/prototype.html) — они нужны, чтобы вёрстка проверялась на
 * правдоподобных объёмах: суммы разной длины, длинные названия регионов,
 * башкирская и казахская кириллица в именах.
 *
 * Файл отдельный от `showcase.ts` намеренно: когда появятся эндпоинты,
 * он удаляется целиком, и ни одна выдуманная цифра не останется в коде,
 * который ходит в сеть.
 */

import type {
  BuildProgress,
  Campaign,
  DonorRankRow,
  FeedItem,
  GalleryItem,
  Region,
  RegionRankRow,
} from "./types";

export const FIXTURE_CAMPAIGN: Campaign = {
  goalKopecks: "24000000000", // 240 000 000 ₽ — цель из ТЗ
  collectedKopecks: "1284000000", // 12 840 000 ₽
  donationsCount: 1204,
  lastPaidAt: "2026-09-21T11:27:00.000Z",
  monthlyGoal: {
    goalKopecks: "600000000", // 6 000 000 ₽
    collectedKopecks: "430000000", // 4 300 000 ₽
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T23:59:59.000Z",
  },
};

/**
 * Список для селектора «Откуда вы?».
 *
 * Порядок повторяет сортировку бэкенда: страны, затем субъекты РФ.
 * Башкортостан стоит первым среди субъектов — это домашний регион сбора.
 * «Россия» в списке есть (её можно выбрать), но в рейтинг она не попадает:
 * флаг `is_ranked` в базе, см. CLAUDE.md.
 */
export const FIXTURE_REGIONS: readonly Region[] = [
  { slug: "bashkortostan", code: "02", name: "Башкортостан", type: "subject", flagUrl: null },
  { slug: "russia", code: "RU", name: "Россия", type: "country", flagUrl: null },
  { slug: "kazakhstan", code: "KZ", name: "Казахстан", type: "country", flagUrl: null },
  { slug: "kyrgyzstan", code: "KG", name: "Кыргызстан", type: "country", flagUrl: null },
  { slug: "moscow", code: "77", name: "Москва", type: "subject", flagUrl: null },
  { slug: "tatarstan", code: "16", name: "Татарстан", type: "subject", flagUrl: null },
  { slug: "chechnya", code: "20", name: "Чечня", type: "subject", flagUrl: null },
  { slug: "dagestan", code: "05", name: "Дагестан", type: "subject", flagUrl: null },
  { slug: "spb", code: "78", name: "Санкт-Петербург", type: "subject", flagUrl: null },
  {
    slug: "chelyabinskaya-oblast",
    code: "74",
    name: "Челябинская область",
    type: "subject",
    flagUrl: null,
  },
  {
    slug: "sverdlovskaya-oblast",
    code: "66",
    name: "Свердловская область",
    type: "subject",
    flagUrl: null,
  },
];

export const FIXTURE_TOP_REGIONS: readonly RegionRankRow[] = [
  {
    slug: "bashkortostan",
    name: "Башкортостан",
    flagUrl: null,
    donorsCount: 412,
    paidTotalKopecks: "73589000",
  },
  {
    slug: "kazakhstan",
    name: "Казахстан",
    flagUrl: null,
    donorsCount: 96,
    paidTotalKopecks: "18040000",
  },
  { slug: "moscow", name: "Москва", flagUrl: null, donorsCount: 88, paidTotalKopecks: "14210000" },
  {
    slug: "tatarstan",
    name: "Татарстан",
    flagUrl: null,
    donorsCount: 61,
    paidTotalKopecks: "9650000",
  },
  {
    slug: "kyrgyzstan",
    name: "Кыргызстан",
    flagUrl: null,
    donorsCount: 55,
    paidTotalKopecks: "7420000",
  },
  { slug: "chechnya", name: "Чечня", flagUrl: null, donorsCount: 40, paidTotalKopecks: "6130000" },
  { slug: "dagestan", name: "Дагестан", flagUrl: null, donorsCount: 37, paidTotalKopecks: "5590000" },
  {
    slug: "spb",
    name: "Санкт-Петербург",
    flagUrl: null,
    donorsCount: 29,
    paidTotalKopecks: "4010000",
  },
  {
    slug: "chelyabinskaya-oblast",
    name: "Челябинская область",
    flagUrl: null,
    donorsCount: 24,
    paidTotalKopecks: "3370000",
  },
  {
    slug: "sverdlovskaya-oblast",
    name: "Свердловская область",
    flagUrl: null,
    donorsCount: 21,
    paidTotalKopecks: "2840000",
  },
];

/** Сколько регионов ещё не получили ни одного пожертвования. */
export const FIXTURE_EMPTY_REGIONS_COUNT = 64;

/**
 * Топ донатеров. Имена и первая буква фамилии — полное ФИО в публичном
 * списке это лишние ПДн. «Ғәлимә» и «Әлихан» здесь не случайны: это
 * проверка того, что шрифт держит башкирскую и казахскую кириллицу.
 */
export const FIXTURE_TOP_DONORS: readonly DonorRankRow[] = [
  { donorName: "Наиль Х.", paidAmountKopecks: "5000000" },
  { donorName: "Руслан А.", paidAmountKopecks: "2500000" },
  { donorName: "Ғәлимә Н.", paidAmountKopecks: "1850000" },
  { donorName: "Әлихан С.", paidAmountKopecks: "1500000" },
  { donorName: "Ильдар М.", paidAmountKopecks: "1200000" },
  { donorName: "Асхат Б.", paidAmountKopecks: "1000000" },
];

/**
 * Лента поступлений. Суммы намеренно разные, включая 10 ₽: лента
 * нормализует малые суммы и прямо поддерживает слоган про 100 ₽.
 */
export const FIXTURE_FEED: readonly FeedItem[] = [
  {
    id: "feed-1",
    paidAt: "2026-09-21T11:32:00.000Z",
    amountKopecks: "10000",
    method: "sbp",
    regionName: "Башкортостан",
    donorName: null,
  },
  {
    id: "feed-2",
    paidAt: "2026-09-21T11:19:00.000Z",
    amountKopecks: "100000",
    method: "sberpay",
    regionName: "Москва",
    donorName: "Наиль Х.",
  },
  {
    id: "feed-3",
    paidAt: "2026-09-21T11:02:00.000Z",
    amountKopecks: "1000",
    method: "sbp",
    regionName: null,
    donorName: null,
  },
  {
    id: "feed-4",
    paidAt: "2026-09-21T10:47:00.000Z",
    amountKopecks: "50000",
    method: "card",
    regionName: "Казахстан",
    donorName: null,
  },
  {
    id: "feed-5",
    paidAt: "2026-09-21T10:31:00.000Z",
    amountKopecks: "30000",
    method: "bank_transfer",
    regionName: "Татарстан",
    donorName: "Ильдар М.",
  },
  {
    id: "feed-6",
    paidAt: "2026-09-21T10:12:00.000Z",
    amountKopecks: "200000",
    method: "tpay",
    regionName: "Башкортостан",
    donorName: null,
  },
  {
    id: "feed-7",
    paidAt: "2026-09-21T09:58:00.000Z",
    amountKopecks: "10000",
    method: "sbp",
    regionName: "Кыргызстан",
    donorName: null,
  },
  {
    id: "feed-8",
    paidAt: "2026-09-21T09:40:00.000Z",
    amountKopecks: "500000",
    method: "card",
    regionName: "Чечня",
    donorName: "Асхат Б.",
  },
];

/**
 * Ход строительства. Текст от заказчика; здесь — структура и пример
 * наполнения из прототипа.
 *
 * TODO(заказчик): настоящие этапы и дата последнего обновления.
 */
export const FIXTURE_BUILD_PROGRESS: BuildProgress = {
  updatedAt: "2026-09-18T00:00:00.000Z",
  done: {
    title: "Выполнено",
    items: ["свайное поле", "фундамент", "подвод коммуникаций"],
  },
  current: {
    title: "Сейчас в работе",
    items: ["кладка стен", "перекрытия"],
  },
  upcoming: {
    title: "Предстоит",
    items: ["купол", "минареты", "отделка"],
  },
};

/**
 * Галерея. `url: null` — настоящих фотографий стройки ещё нет
 * (блокер из CLAUDE.md), до них показываем плашку с датой.
 * Требования к съёмке — docs/design/photos.md.
 */
export const FIXTURE_GALLERY: readonly GalleryItem[] = [
  { id: "shot-1", url: null, caption: "Заливка фундамента", takenAtLabel: "июнь 2026" },
  { id: "shot-2", url: null, caption: "Свайное поле", takenAtLabel: "июль 2026" },
  { id: "shot-3", url: null, caption: "Кладка стен", takenAtLabel: "август 2026" },
  { id: "shot-4", url: null, caption: "Перекрытия", takenAtLabel: "сентябрь 2026" },
];
