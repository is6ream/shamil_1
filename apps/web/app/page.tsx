import { ConstructionTimeline } from "@/components/build/ConstructionTimeline";
import { DonationWidget } from "@/components/donation/DonationWidget";
import { MobileDonateBar } from "@/components/donation/MobileDonateBar";
import { HeroIntro } from "@/components/hero/HeroIntro";
import { MobileAccordion } from "@/components/layout/MobileAccordion";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AboutSection } from "@/components/sections/AboutSection";
import { HadithBand } from "@/components/sections/HadithBand";
import { ReportsSection } from "@/components/sections/ReportsSection";
import { RequisitesSection } from "@/components/sections/RequisitesSection";
import { StatsGrid } from "@/components/sections/StatsGrid";
import { SharePanel } from "@/components/share/SharePanel";
import {
  GALLERY_PLACEHOLDERS,
  HOME_REGIONS_LIMIT,
  getCampaign,
  getFeed,
  getGallery,
  getRegions,
  getTopRegions,
} from "@/lib/api/showcase";
import { FALLBACK_CONTENT, getConstruction, getSiteContent, getVideos } from "@/lib/api/site-content";
import { FIXTURE_CONSTRUCTION } from "@/lib/api/showcase.fixtures";
import type { FeedPage } from "@/lib/api/types";
import { withFallback } from "@/lib/api/with-fallback";
import { MOBILE_SECTIONS, SECTION_IDS } from "@/lib/content";

import styles from "./page.module.css";

/**
 * Главная по макету v2 (docs/design/landing-v2, 25.09.2026).
 *
 * Одна сетка на всю страницу — чтобы порядок блоков на телефоне менялся
 * CSS-ом, без второй копии разметки:
 *
 *   Десктоп (≥1024): слева первый экран → статистика → «О проекте» →
 *     «Ход строительства», справа sticky-форма; дальше во всю ширину
 *     хадис, отчёты, «Поделиться», реквизиты.
 *   Планшет (768–1023): одна колонка в том же порядке, форма после «Собрано».
 *   Телефон (<768): первый экран → форма → хадис → аккордеон из четырёх
 *     строк; статистики и «О проекте» нет (как в макете).
 *
 * Серверный компонент: витрина читается здесь и уходит вниз пропсами.
 * Клиентские только островки: форма, меню, аккордеон, копирование, share.
 */
/**
 * Перегенерация главной — не реже раза в 15 секунд: так же живут цифры
 * сбора в `showcase.ts`. Значение дублируется здесь, чтобы главная
 * обновлялась, даже если на `next build` бэкенд был недоступен.
 */
export const revalidate = 15;

const EMPTY_FEED: FeedPage = { items: [], nextCursor: null };

export default async function HomePage() {
  // Бэкенд недоступен — страница всё равно рендерится: форма работает,
  // вместо цифр «обновляем данные», пустые рейтинги не рисуются (with-fallback.ts).
  // Тексты, этапы и видео — из админки; пока их там нет или API недоступен,
  // главная выглядит как до админки (хардкод и фикстуры).
  const [campaign, regions, topRegions, construction, gallery, feed, content, videos] = await Promise.all([
    withFallback(getCampaign(), null, "цифры сбора"),
    withFallback(getRegions(), [], "справочник регионов"),
    withFallback(getTopRegions(), [], "рейтинг регионов"),
    withFallback(getConstruction(), FIXTURE_CONSTRUCTION, "ход стройки"),
    withFallback(getGallery(), GALLERY_PLACEHOLDERS, "галерея"),
    withFallback(getFeed(), EMPTY_FEED, "лента поступлений"),
    withFallback(getSiteContent(), FALLBACK_CONTENT, "тексты сайта"),
    withFallback(getVideos(), [], "видео"),
  ]);

  return (
    <>
      <SiteHeader phone={content.contacts.phone} helpButton={content.hero.helpButton} />

      <main className={styles.page}>
        <div className={styles.head}>
          <HeroIntro campaign={campaign} hero={content.hero} />
        </div>

        <aside className={styles.aside} id={SECTION_IDS.donate} aria-label="Форма пожертвования">
          <div className={styles.asideSticky}>
            <DonationWidget regions={regions} />
          </div>
        </aside>

        <div className={styles.stats}>
          {campaign === null ? null : <StatsGrid campaign={campaign} regionsCount={topRegions.length} />}
        </div>

        <div className={styles.about}>
          <AboutSection about={content.about} />
        </div>

        <MobileAccordion
          className={styles.construction}
          id={SECTION_IDS.construction}
          title={MOBILE_SECTIONS.construction}
        >
          <ConstructionTimeline timeline={construction} gallery={gallery} video={videos[0] ?? null} />
        </MobileAccordion>

        <div className={styles.band}>
          <HadithBand />
        </div>

        <MobileAccordion className={styles.reports} id={SECTION_IDS.reports} title={MOBILE_SECTIONS.reports}>
          <ReportsSection regions={topRegions.slice(0, HOME_REGIONS_LIMIT)} feed={feed} />
        </MobileAccordion>

        <MobileAccordion className={styles.share} id={SECTION_IDS.share} title={MOBILE_SECTIONS.share}>
          <SharePanel />
        </MobileAccordion>

        <MobileAccordion
          className={styles.requisites}
          id={SECTION_IDS.requisites}
          title={MOBILE_SECTIONS.requisites}
        >
          <RequisitesSection bank={content.bank} />
        </MobileAccordion>
      </main>

      <SiteFooter contacts={content.contacts} />
      {campaign === null ? null : <MobileDonateBar campaign={campaign} />}
    </>
  );
}
