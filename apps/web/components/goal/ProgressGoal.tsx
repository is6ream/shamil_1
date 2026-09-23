import type { ReactNode } from "react";

import type { Campaign } from "@/lib/api/types";
import { formatCount, plural } from "@/lib/format";
import {
  kopecksToRubDisplay,
  kopecksToRubNumberDisplay,
  percentOfGoal,
  remainderInMinDonations,
  remainderToGoal,
} from "@/lib/money";
import { MIN_DONATION_RUBLES } from "@/lib/site";

import { ProgressTrack } from "./ProgressTrack";

interface Props {
  readonly campaign: Campaign;
  readonly regionsCount: number;
}

interface MeterProps {
  readonly label: string;
  readonly collectedKopecks: string;
  readonly goalKopecks: string;
  readonly isThin?: boolean;
  readonly children?: ReactNode;
}

function Meter({ label, collectedKopecks, goalKopecks, isThin, children }: MeterProps) {
  const percent = percentOfGoal(collectedKopecks, goalKopecks);
  const isDone = percent >= 100;

  return (
    <div className={`meter${isDone ? " done" : ""}`}>
      <div className="head">
        <span className="lbl">{label}</span>
        {/* Перевыполнение не обрезаем: это сильный сигнал, а не ошибка данных. */}
        <span className="pct">{formatCount(Math.round(percent))}%</span>
      </div>
      <div className="val">
        {kopecksToRubNumberDisplay(collectedKopecks)}{" "}
        <small>из {kopecksToRubDisplay(goalKopecks)}</small>
      </div>
      <ProgressTrack percent={percent} label={label} isThin={isThin} />
      {children}
    </div>
  );
}

/**
 * «5 мин», «3 ч», «2 дн» — без слова «назад», оно стоит подписью.
 *
 * Считается на сервере: одно значение для всех, без расхождения между
 * разметкой и гидратацией. Страница статическая, поэтому вместе с боевым
 * `GET /campaign` ей понадобится `revalidate` — иначе «5 мин назад»
 * застынет на времени сборки.
 */
function formatSinceLastPayment(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

  if (minutes < 60) {
    return `${formatCount(minutes)} мин`;
  }

  const hours = Math.round(minutes / 60);

  return hours < 24 ? `${formatCount(hours)} ч` : `${formatCount(Math.round(hours / 24))} дн`;
}

/**
 * Блок «Цель сбора» с двумя шкалами.
 *
 * Месячная стоит первой и крупнее общей намеренно: при цели 240 млн общая
 * шкала на старте показывает доли процента и читается как провал. Месячная
 * цель — единственное, что спасает первый экран сбора.
 *
 * Если заказчик ещё не назвал сумму месяца, показываем только общую: врать
 * про несуществующую планку нельзя, а пустая шкала выглядит как поломка.
 */
export function ProgressGoal({ campaign, regionsCount }: Props) {
  const monthly = campaign.monthlyGoal;

  return (
    <section id="goal">
      <div className="card">
        <h2>{monthly === null ? "Цель сбора" : "Цель на этот месяц"}</h2>
        <p className="sub">
          {monthly === null
            ? "Строительство мечети «Шамиль» в Уфе на 500 человек"
            : "Каждый месяц мы ставим планку, которую реально взять всем вместе"}
        </p>

        {monthly === null ? null : (
          <Meter
            label="Собрано за месяц"
            collectedKopecks={monthly.collectedKopecks}
            goalKopecks={monthly.goalKopecks}
          >
            <p className="rest">
              {/* «17 000 пожертвований по сотне» звучит достижимо,
                  «1 700 000 ₽» — нет. */}
              Осталось{" "}
              {kopecksToRubDisplay(
                remainderToGoal(monthly.collectedKopecks, monthly.goalKopecks),
              )}{" "}
              — это{" "}
              {formatCount(
                remainderInMinDonations(monthly.collectedKopecks, monthly.goalKopecks),
              )}{" "}
              {plural(
                remainderInMinDonations(monthly.collectedKopecks, monthly.goalKopecks),
                ["пожертвование", "пожертвования", "пожертвований"],
              )}{" "}
              по {MIN_DONATION_RUBLES} ₽
            </p>
          </Meter>
        )}

        <Meter
          label="Общая цель"
          collectedKopecks={campaign.collectedKopecks}
          goalKopecks={campaign.goalKopecks}
          isThin
        />

        <div className="stats">
          <div>
            <b>{formatCount(campaign.donationsCount)}</b>
            <span>
              {plural(campaign.donationsCount, [
                "пожертвование",
                "пожертвования",
                "пожертвований",
              ])}
            </span>
          </div>
          <div>
            <b>{formatCount(regionsCount)}</b>
            <span>
              {plural(regionsCount, [
                "регион и страна",
                "региона и страны",
                "регионов и стран",
              ])}
            </span>
          </div>
          <div>
            <b>
              {campaign.lastPaidAt === null
                ? "—"
                : formatSinceLastPayment(campaign.lastPaidAt)}
            </b>
            <span>
              {campaign.lastPaidAt === null ? "пока без поступлений" : "назад, последнее"}
            </span>
          </div>
        </div>

        <div className="cta">
          <a className="btn btn-primary" href="#donate">
            Внести свой вклад
          </a>
        </div>
      </div>
    </section>
  );
}
