import { pluralize } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";

import { HandsScene } from "./HandsScene";
import styles from "./HeroSection.module.css";

interface Props {
  readonly collectedKopecks: string;
  readonly donationsCount: number;
  /** Сколько регионов и стран уже поддержали сбор. */
  readonly regionsCount: number;
}

/**
 * Первый экран: слоган как обещание с названной ценой входа — и сразу CTA.
 * Не описание сбора: именно этого нет у референса, где первый экран
 * начинается с подписи к фотографии.
 *
 * Состояние первого дня (`donationsCount === 0`) отличается сознательно:
 * строка «уже собрано» исчезает целиком, надзаголовок меняется на «Сбор
 * открыт». «Собрано 0 ₽» убивает доверие сильнее, чем отсутствие строки,
 * а выдумывать доноров мы не будем.
 */
export function HeroSection({ collectedKopecks, donationsCount, regionsCount }: Props) {
  const hasDonations = donationsCount > 0;

  return (
    <section className={`hero ${styles.hero}`} id="top">
      <div className={styles.grid}>
        <div className={styles.text}>
          <div className={`eyebrow ${styles.eyebrow}`}>
            <span className="dot" />
            {/* «уже помогли N человек», а не «N человек уже помогли»:
                при одном пожертвовании второй вариант даёт «1 человек
                уже помогли». */}
            {hasDonations
              ? `Сбор идёт · уже помогли ${pluralize(donationsCount, [
                  "человек",
                  "человека",
                  "человек",
                ])}`
              : "Сбор открыт"}
          </div>

          <h1 className={styles.title}>
            Мы поможем вам построить себе дом в раю <em className={styles.accent}>за 100 ₽</em>
          </h1>

          <div className={`cta ${styles.cta}`}>
            <a className="btn btn-primary" href="#donate">
              Пожертвовать от 100 ₽
            </a>
            <a className="btn btn-ghost" href="#share">
              Поделиться сбором
            </a>
          </div>

          <p className={`lede ${styles.lede}`}>
            Мечеть «Шамиль» в Уфе на 500 человек. Каждый вклад остаётся садака джария —
            тем, что продолжает приносить награду и после нас.
          </p>

          {hasDonations ? (
            <p className={styles.proof}>
              Уже собрано <b>{kopecksToRubDisplay(collectedKopecks)}</b> из {regionsCount}{" "}
              регионов и стран
            </p>
          ) : null}
        </div>

        <div className={styles.scene}>
          <HandsScene caption="Ваши 100 ₽ — это купол, который простоит дольше нас" />
        </div>
      </div>
    </section>
  );
}
