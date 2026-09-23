import type { DonorRankRow } from "@/lib/api/types";
import { kopecksToRubDisplay } from "@/lib/money";

interface Props {
  readonly donors: readonly DonorRankRow[];
}

/**
 * Топ донатеров — блок 5 ТЗ. У референса его нет вовсе.
 *
 * Он конфликтует с блоком 9 («садака — скрытое поклонение»), и конфликт
 * снимается не отказом от блока, а заголовком: чекбокс анонимности включён
 * по умолчанию, сюда попадают только те, кто снял его сознательно. Короткий
 * список — не баг, а следствие этого решения, и формулировка превращает
 * пустоту из недостатка в достоинство.
 */
export function DonorsTop({ donors }: Props) {
  if (donors.length === 0) {
    return (
      <section id="donors">
        <h2>Спасибо тем, кто жертвует</h2>
        <p className="sub">
          Пока все пожертвования анонимны — и это лучшая форма садака. Здесь появятся
          имена тех, кто разрешит себя назвать.
        </p>
      </section>
    );
  }

  return (
    <section id="donors">
      <h2>Спасибо тем, кто разрешил себя назвать</h2>
      <p className="sub">Большинство жертвует анонимно — и это лучшая форма садака</p>

      <div className="card">
        <ol className="rank-list">
          {donors.map((donor, index) => (
            <li className="rank" key={`${donor.donorName}-${index}`}>
              <div className="pos">{index + 1}</div>
              <div className="body">
                <div className="name">{donor.donorName}</div>
              </div>
              <div className="amt">{kopecksToRubDisplay(donor.paidAmountKopecks)}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
