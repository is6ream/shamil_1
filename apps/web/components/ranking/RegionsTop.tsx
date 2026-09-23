import Image from "next/image";

import type { RegionRankRow } from "@/lib/api/types";
import { formatCount, plural } from "@/lib/format";
import { kopecksToRubDisplay, percentOfGoal } from "@/lib/money";

import { ProgressTrack } from "../goal/ProgressTrack";

interface Props {
  readonly regions: readonly RegionRankRow[];
  /** Сколько регионов ещё без пожертвований. */
  readonly emptyCount: number;
}

/** Размер флага из kit.css (`.rank .flag`). */
const FLAG_WIDTH_PX = 30;
const FLAG_HEIGHT_PX = 21;

/**
 * Топ поддерживающих регионов и стран.
 *
 * Землячество — осознанный приём заказчика, а не украшение: людям важно
 * видеть, что из их республики деньгами делятся. Страны стоят в одном
 * списке с субъектами: с Kaspi и Mbank придут донаты из Казахстана
 * и Кыргызстана, и класть их больше некуда.
 *
 * Пустые регионы показываем числом, а не стеной строк: пустая строка
 * работает как вызов, а 64 нуля подряд читаются как «блок сломан».
 */
export function RegionsTop({ regions, emptyCount }: Props) {
  if (regions.length === 0) {
    return (
      <section id="regions">
        <div className="card">
          <h2>Откуда помогают</h2>
          <p className="sub">
            Первое пожертвование ещё не пришло. Ваш регион может открыть этот список.
          </p>
          <div className="cta">
            <a className="btn btn-primary" href="#donate">
              Поддержать за свой регион
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Шкала внутри строки — доля от лидера, а не от цели сбора: при цели
  // 240 млн все полоски были бы одинаково невидимыми.
  const leaderKopecks = regions[0].paidTotalKopecks;

  return (
    <section id="regions">
      <div className="card">
        <h2>Откуда помогают</h2>
        <p className="sub">
          Землячество — не украшение: людям важно видеть, что из их республики деньгами
          делятся
        </p>

        <ol className="rank-list">
          {regions.map((region, index) => (
            <li className="rank" key={region.slug}>
              <div className="pos">{index + 1}</div>
              {/* TODO(заказчик): флаги регионов — откуда берём изображения.
                  Пока строка живёт без флага: серый прямоугольник-заглушка
                  в рейтинге выглядит как незагрузившаяся картинка. */}
              {region.flagUrl === null ? null : (
                <Image
                  className="flag"
                  src={region.flagUrl}
                  alt=""
                  width={FLAG_WIDTH_PX}
                  height={FLAG_HEIGHT_PX}
                  unoptimized
                />
              )}
              <div className="body">
                <div className="name">{region.name}</div>
                <div className="sum">
                  {formatCount(region.donorsCount)}{" "}
                  {plural(region.donorsCount, [
                    "пожертвование",
                    "пожертвования",
                    "пожертвований",
                  ])}
                </div>
                <ProgressTrack
                  percent={percentOfGoal(region.paidTotalKopecks, leaderKopecks)}
                  label={`Доля ${region.name} от лидера рейтинга`}
                  isThin
                />
              </div>
              <div className="amt">{kopecksToRubDisplay(region.paidTotalKopecks)}</div>
            </li>
          ))}
        </ol>

        {emptyCount > 0 ? (
          <p className="micro">
            Ещё {formatCount(emptyCount)}{" "}
            {plural(emptyCount, ["регион ждёт", "региона ждут", "регионов ждут"])} первого
            пожертвования
          </p>
        ) : null}

        <div className="cta">
          <a className="btn btn-primary" href="#donate">
            Поддержать за свой регион
          </a>
        </div>
      </div>
    </section>
  );
}
