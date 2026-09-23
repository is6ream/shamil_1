import styles from "./FinalCta.module.css";

/**
 * Блок 10 ТЗ — финальный призыв.
 *
 * Заголовок и подзаголовок — слова заказчика почти дословно, это не
 * религиозная цитата: верстается сразу, выверка не нужна.
 *
 * Альтернативный призыв поделиться требует ТЗ: он ловит тех, кто дочитал,
 * но не готов платить. Это не потерянный посетитель, а бесплатный канал.
 */
export function FinalCta() {
  return (
    <section id="final-cta">
      <div className="panel center">
        <div className="pattern" />
        <div className="narrow">
          <h2 className={styles.title}>
            Мы призываем вас принять участие в благословенном деле строительства мечети
          </h2>
          <p className={`sub ${styles.lede}`}>
            Помогите другим людям и своим близким тоже попасть в рай и построить себе
            дворцы в раю
          </p>

          <div className={`cta ${styles.cta}`}>
            <a className="btn btn-primary" href="#donate">
              Пожертвовать от 100 ₽
            </a>
          </div>

          <p className={`sub ${styles.lede} ${styles.second}`}>
            Не можете сейчас? Расскажите о сборе — награда указавшего на благое не меньше
          </p>

          <div className={`cta ${styles.cta}`}>
            <a className="btn btn-ghost" href="#share">
              Поделиться
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
