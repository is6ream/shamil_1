import { HadithStub } from "@/components/content/HadithStub";

import { HourglassScene } from "./HourglassScene";
import styles from "./TimeValue.module.css";

/** Три пилюли под текстом — то же, что три падающие крупинки в иллюстрации. */
const VALUES = ["время", "молодость", "здоровье"] as const;

/**
 * Блок 8 ТЗ — «Цени, пока не потерял».
 *
 * Текст хадиса о пяти вещах ждёт выверки имамом: на записи разговора
 * участники сами восстанавливали его по памяти и не были уверены —
 * это прямая причина правила «не придумывать».
 */
export function TimeValue() {
  return (
    <section id="time">
      <div className={`card ${styles.wrap}`}>
        <div className={styles.grid}>
          <HourglassScene />

          <div>
            <h2>Цени, пока не потерял</h2>

            <HadithStub
              label="хадис о пяти вещах — ожидает выверки имамом"
              gist="На записи разговора участники сами восстанавливали текст по памяти
                и не были уверены в формулировке."
            />

            <div className={`chips ${styles.values}`}>
              {VALUES.map((value) => (
                <span className="chip" key={value}>
                  {value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
