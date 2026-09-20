import { SITE_NAME, SLOGAN } from "@/lib/site";

import styles from "./page.module.css";

/**
 * Каркас главной. Порядок блоков зафиксирован ТЗ §5 и не меняется —
 * наполнение идёт по дням 10–13 роудмапа, здесь пока заглушки.
 */
const SECTIONS = [
  { id: "hero", title: "Слоган и призыв" },
  { id: "goal", title: "Цель сбора и прогресс" },
  { id: "share", title: "Поделиться сбором" },
  { id: "regions", title: "Топ поддерживающих регионов" },
  { id: "donors", title: "Топ донатеров" },
  { id: "gallery", title: "Фотогалерея стройки" },
  { id: "why-mosque", title: "Почему мечеть" },
  { id: "time", title: "Ценность времени" },
  { id: "sadaqa", title: "Ценность садака" },
  { id: "final-cta", title: "Финальный призыв" },
  { id: "payment", title: "Способы оплаты" },
] as const;

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Каркас проекта</p>
        <h1>
          {SITE_NAME} — {SLOGAN}
        </h1>
        <p className={styles.lede}>
          Фронтенд поднят, шрифты и палитра подключены. Блоки ниже —
          заглушки в порядке, зафиксированном ТЗ; вёрстка идёт по роудмапу.
        </p>
      </header>

      <ol className={styles.sections}>
        {SECTIONS.map((section, index) => (
          <li key={section.id} className={styles.section}>
            <span className={styles.index}>{index + 1}</span>
            <span>{section.title}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
