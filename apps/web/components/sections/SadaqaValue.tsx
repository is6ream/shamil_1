import { HadithStub } from "@/components/content/HadithStub";

import styles from "./SadaqaValue.module.css";

interface ValueCard {
  readonly icon: string;
  readonly title: string;
  readonly text: string | null;
}

/**
 * Первая карточка написана по прямому пересказу заказчика и религиозной
 * цитатой не является — её можно верстать сразу. Две других ждут
 * формулировок от имама: `null` вместо текста ставит заглушку.
 */
const CARDS: readonly ValueCard[] = [
  {
    icon: "🤲",
    title: "Скрытое поклонение",
    text: "Намаз и пост видны другим. Садака — нет. Её видит только Тот, ради Кого она совершается.",
  },
  { icon: "⏳", title: "Продлевает жизнь", text: null },
  { icon: "🏠", title: "Баракат в семье", text: null },
];

/**
 * Блок 9 ТЗ — «Ценность садака».
 *
 * Он же объясняет, почему чекбокс анонимности в форме включён по умолчанию
 * и почему топ донатеров получается коротким: это не недоработка,
 * а прямое следствие текста этого блока.
 */
export function SadaqaValue() {
  return (
    <section id="sadaqa">
      <h2 className="center">Почему садака особенная</h2>
      <p className={`sub center ${styles.lede}`}>
        Единственное поклонение, которое можно совершить так, что о нём не узнает никто
      </p>

      <div className="three">
        {CARDS.map((card) => (
          <div className="vcard" key={card.title}>
            <div className="ico" aria-hidden="true">
              {card.icon}
            </div>
            <h3>{card.title}</h3>
            {card.text === null ? (
              <HadithStub label={`«${card.title}» — формулировка к имаму`} />
            ) : (
              <p className={`muted ${styles.cardText}`}>{card.text}</p>
            )}
          </div>
        ))}
      </div>

      <div className={`narrow ${styles.ayah}`}>
        <HadithStub label="аят Бакара 2:261 — перевод и оформление к имаму" />
      </div>
    </section>
  );
}
