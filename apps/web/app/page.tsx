import { BuildSection } from "@/components/build/BuildSection";
import { DonationWidget } from "@/components/donation/DonationWidget";
import { DonationsFeed } from "@/components/feed/DonationsFeed";
import { ProgressGoal } from "@/components/goal/ProgressGoal";
import { HeroSection } from "@/components/hero/HeroSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { DonorsTop } from "@/components/ranking/DonorsTop";
import { RegionsTop } from "@/components/ranking/RegionsTop";
import { FinalCta } from "@/components/sections/FinalCta";
import { SadaqaValue } from "@/components/sections/SadaqaValue";
import { TimeValue } from "@/components/sections/TimeValue";
import { WhyMosque } from "@/components/sections/WhyMosque";
import { ShareBlock } from "@/components/share/ShareBlock";
import {
  getBuildProgress,
  getCampaign,
  getEmptyRegionsCount,
  getFeed,
  getGallery,
  getRegions,
  getTopDonors,
  getTopRegions,
} from "@/lib/api/showcase";

import styles from "./page.module.css";

/**
 * Главная.
 *
 * ПОРЯДОК БЛОКОВ ИЗМЕНЁН 21.09.2026 по решению заказчика: форма оплаты
 * поднята из одиннадцатого блока ТЗ §5 в правую колонку и видна с первого
 * экрана. Раскладка взята у референса mahallya-kasim.ru — его механика,
 * наша подача: палитра, шрифты и графика остаются нашими. Остальные десять
 * блоков идут в прежнем порядке.
 *
 *   Десктоп (≥1024px): слева Hero → Цель → … → Лента, справа sticky-виджет.
 *   Телефон: Hero → Цель → Форма → остальное, одной колонкой.
 *
 * Серверный компонент: витрина читается здесь и уходит вниз пропсами.
 * Сейчас за ней стоят моки (lib/api/showcase.ts), интерфейс — уже боевой.
 */
export default async function HomePage() {
  const [campaign, regions, topRegions, emptyRegions, donors, build, gallery, feed] =
    await Promise.all([
      getCampaign(),
      getRegions(),
      getTopRegions(),
      getEmptyRegionsCount(),
      getTopDonors(),
      getBuildProgress(),
      getGallery(),
      getFeed(),
    ]);

  return (
    <>
      <SiteHeader />

      <main className={styles.columns}>
        <div className={styles.head}>
          <HeroSection
            collectedKopecks={campaign.collectedKopecks}
            donationsCount={campaign.donationsCount}
            regionsCount={topRegions.length}
          />
          <ProgressGoal campaign={campaign} regionsCount={topRegions.length} />
        </div>

        <aside className={styles.aside} id="donate" aria-label="Форма пожертвования">
          <DonationWidget campaign={campaign} regions={regions} />
        </aside>

        <div className={styles.rest}>
          <ShareBlock />
          <BuildSection progress={build} gallery={gallery} />
          <RegionsTop regions={topRegions} emptyCount={emptyRegions} />
          <DonorsTop donors={donors} />
          <WhyMosque />
          <TimeValue />
          <SadaqaValue />
          <FinalCta />
          <DonationsFeed initialPage={feed} />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
