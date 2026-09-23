"use client";

import { HadithStub } from "@/components/content/HadithStub";

import { ShareLinks } from "./ShareLinks";
import { useShareCounts } from "./useShareCounts";

/**
 * Блок «Поделиться сбором» — третий по ТЗ и один из главных каналов
 * распространения: расчёт строится на репостах в земляческие чаты,
 * а не на рекламе.
 *
 * Рядом стоит хадис о награде за указание на благое дело — пока
 * заглушкой: до выверки имамом текст не публикуется.
 */
export function ShareBlock() {
  const { counts, register } = useShareCounts();

  return (
    <section id="share">
      <div className="panel">
        <div className="pattern" />
        <div className="narrow center">
          <div className="eyebrow">Расскажите о сборе</div>

          <HadithStub
            label="хадис о награде за указание на благое — ожидает выверки имамом"
            gist="Смысл по пересказу заказчика: указавшему на благое дело — такая же награда,
              как совершившему его. Дословный текст и источник даёт имам."
          />

          <p className="sub">
            Один репост в земляческий чат приводит больше, чем десять просмотров рекламы
          </p>
        </div>

        <ShareLinks counts={counts} onShared={register} />
      </div>
    </section>
  );
}
