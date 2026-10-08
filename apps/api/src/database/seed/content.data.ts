import type { AboutBlock, ContactsBlock, FaqBlock, HeroBlock, RequisitesBlock } from '../../content/content.types';
import type { ConstructionStageStatus } from '../../generated/prisma/enums';

/**
 * Стартовый контент — дословно то, что сейчас захардкожено во фронте
 * (ANALYSIS §5): `apps/web/lib/content.ts` (HERO, ABOUT), `lib/organization.ts`
 * (контакты, BANK_DETAILS), `lib/api/showcase.fixtures.ts` (FIXTURE_CONSTRUCTION).
 * После переноса фронт берёт эти тексты из API, а заказчик правит их в админке.
 *
 * Хадисы (HADITH_BAND, SHARE.quote) сюда не переносятся: по CLAUDE.md они
 * публикуются только после выверки имамом и через API не редактируются (D-10).
 * Юридические реквизиты организации (наименование, ИНН, ОГРН, юр. адрес) —
 * тоже: это не контент, а данные юрлица.
 */

export const HERO_SEED: HeroBlock = {
  badge: 'Идёт сбор · г. Уфа',
  title: 'Построим мечеть «Шамиль» вместе',
  lede:
    'Мечеть на 500 молящихся в Уфе. Каждый вклад — садака джария: награда за неё ' +
    'записывается, пока в стенах мечети совершается поклонение.',
  ledeShort: 'Мечеть на 500 молящихся в Уфе. Каждый вклад — садака джария.',
  trust: ['Официальная религиозная организация', 'Отчёт по каждому этапу', 'Комиссия уже включена'],
  renderMediaId: null,
  renderCaption: 'Рендер мечети «Шамиль»',
  helpButton: 'Помочь',
};

export const ABOUT_SEED: AboutBlock = {
  eyebrow: 'О проекте',
  title: 'Дом для махалли и для следующих поколений',
  // TODO(заказчик): 2–3 предложения от Усмана — во фронте тоже null.
  text: null,
  facadeMediaId: null,
  facadeCaption: 'Эскиз фасада',
  facts: [
    { value: '500', unit: null, label: 'молящихся вмещает мечеть' },
    { value: null, unit: null, label: 'планируемое открытие' },
    { value: 'г. Уфа', unit: null, label: null },
    { value: null, unit: 'м²', label: null },
  ],
};

/** Все реквизиты — `null`, как и во фронте: выдуманный номер счёта — это деньги в никуда. */
export const REQUISITES_SEED: RequisitesBlock = {
  accountNumber: null,
  bankName: null,
  bik: null,
  correspondentAccount: null,
  kpp: null,
  sbpQrMediaId: null,
};

/** Телефон и e-mail — из публичной оферты заказчика (`lib/organization.ts`). */
export const CONTACTS_SEED: ContactsBlock = {
  phone: '+7 (917) 756-77-77',
  email: 'mosqueshamil@gmail.com',
  telegramChannel: null,
  mosqueAddress: null,
};

/** FAQ на сайте пока не выводится (D-11). */
export const FAQ_SEED: FaqBlock = { items: [] };

export interface StageSeed {
  readonly title: string;
  readonly status: ConstructionStageStatus;
  readonly budgetKopecks: bigint;
}

/**
 * Этапы из `FIXTURE_CONSTRUCTION`. Во фронте помечено: «статусы и сметы
 * выдуманы» — это пример наполнения из макета. **[проверить]** у заказчика;
 * переносим как есть, чтобы сайт после перехода на API выглядел так же.
 */
export const STAGES_SEED: readonly StageSeed[] = [
  { title: 'Проект и разрешительная документация', status: 'done', budgetKopecks: 320_000_000n },
  { title: 'Земляные работы и фундамент', status: 'done', budgetKopecks: 2_150_000_000n },
  { title: 'Стены и перекрытия', status: 'current', budgetKopecks: 5_400_000_000n },
  { title: 'Кровля, купол и минарет', status: 'upcoming', budgetKopecks: 4_800_000_000n },
  { title: 'Инженерные сети', status: 'upcoming', budgetKopecks: 3_100_000_000n },
  { title: 'Внутренняя и наружная отделка', status: 'upcoming', budgetKopecks: 6_200_000_000n },
  { title: 'Благоустройство территории', status: 'upcoming', budgetKopecks: 2_030_000_000n },
];
