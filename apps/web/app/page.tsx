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
  HOME_REGIONS_LIMIT,
  getCampaign,
  getConstructionStages,
  getFeed,
  getGallery,
  getRegions,
  getTopRegions,
} from "@/lib/api/showcase";
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
export default async function HomePage() {
  const [campaign, regions, topRegions, construction, gallery, feed] = await Promise.all([
    getCampaign(),
    getRegions(),
    getTopRegions(),
    getConstructionStages(),
    getGallery(),
    getFeed(),
  ]);

  return (
    <>
      <SiteHeader />

      <main className={styles.page}>
        <div className={styles.head}>
          <HeroIntro campaign={campaign} />
        </div>

        <aside className={styles.aside} id={SECTION_IDS.donate} aria-label="Форма пожертвования">
          <DonationWidget regions={regions} />
        </aside>

        <div className={styles.stats}>
          <StatsGrid campaign={campaign} regionsCount={topRegions.length} />
        </div>

        <div className={styles.about}>
          <AboutSection />
        </div>

        <MobileAccordion
          className={styles.construction}
          id={SECTION_IDS.construction}
          title={MOBILE_SECTIONS.construction}
        >
          <ConstructionTimeline timeline={construction} gallery={gallery} />
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
          <RequisitesSection />
        </MobileAccordion>
      </main>

      <SiteFooter />
      <MobileDonateBar campaign={campaign} />
    </>
  );
}
