import { ConstructionTimeline } from "@/components/build/ConstructionTimeline";
import { DonationWidget } from "@/components/donation/DonationWidget";
import { MobileDonateBar } from "@/components/donation/MobileDonateBar";
import { HeroIntro } from "@/components/hero/HeroIntro";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ConstructionLocation } from "@/components/sections/ConstructionLocation";
import { HadithBand } from "@/components/sections/HadithBand";
import { ReportsSection } from "@/components/sections/ReportsSection";
import { RequisitesSection } from "@/components/sections/RequisitesSection";
import { SharePanel } from "@/components/share/SharePanel";
import {
  GALLERY_PLACEHOLDERS,
  getActiveGoal,
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
import { SECTION_IDS } from "@/lib/content";

import styles from "./page.module.css";

// Лента обновляется при открытии страницы, интервалы кеширования остальных данных задаёт API-слой.
export const revalidate = 0;

const EMPTY_FEED: FeedPage = { items: [], nextCursor: null };

export default async function HomePage() {
  const [campaign, regions, construction, gallery, feed, content, videos, activeGoal] = await Promise.all([
    withFallback(getCampaign(), null, "цифры сбора"),
    withFallback(getRegions(), [], "справочник регионов"),
    withFallback(getConstruction(), FIXTURE_CONSTRUCTION, "ход стройки"),
    withFallback(getGallery(), GALLERY_PLACEHOLDERS, "галерея"),
    withFallback(getFeed(), EMPTY_FEED, "лента поступлений"),
    withFallback(getSiteContent(), FALLBACK_CONTENT, "тексты сайта"),
    withFallback(getVideos(), [], "видео"),
    withFallback(getActiveGoal(), null, "активный этап сбора"),
  ]);

  const topRegions = withFallback(getTopRegions(), null, "рейтинг регионов");

  return (
    <>
      <SiteHeader landing />

      <main className={styles.page}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.hero}>
          <div className={`${styles.wrap} ${styles.head} on-dark`}>
            <HeroIntro campaign={campaign} hero={content.hero} goal={activeGoal} />
          </div>
        </div>

        <aside className={styles.donationRail} id={SECTION_IDS.donate} aria-label="Форма пожертвования">
          <div className={styles.donationPanel}>
            <DonationWidget regions={regions} />
          </div>
        </aside>

        <div className={styles.sections}>
          <section className={styles.construction} id={SECTION_IDS.construction}>
            <div className={styles.wrap}>
              <ConstructionTimeline timeline={construction} gallery={gallery} video={videos[0] ?? null} />
            </div>
          </section>

          <div className={styles.band}><div className={styles.wrap}><HadithBand /></div></div>

          <div className={styles.routeReports}>
            <div className={styles.wrap}>
              <ConstructionLocation />
              <div className={styles.reports} id={SECTION_IDS.reports}>
                <ReportsSection regions={topRegions} feed={feed} />
              </div>
            </div>
          </div>

          <div className={`${styles.wrap} ${styles.share}`} id={SECTION_IDS.share}>
            <SharePanel />
          </div>

          <section className={styles.requisites} id={SECTION_IDS.requisites}>
            <div className={styles.wrap}><RequisitesSection bank={content.bank} /></div>
          </section>
        </div>
      </main>

      <SiteFooter contacts={content.contacts} />
      {campaign === null ? null : <MobileDonateBar campaign={campaign} />}
    </>
  );
}
