import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ActiveGoal } from "./goal-progress";
import { formatStagePercent, stageFigures, stageFillRatio, stagePercentTenths } from "./stage-card";

/** 750 000 ₽ в копейках. */
const TARGET = "75000000";

/** Неразрывные пробелы → обычные: ожидания в тестах читаются глазами. */
function plain<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(/\u00A0/g, " ")) as T;
}

function goal(collectedAmountKopecks: string, isReached = false): ActiveGoal {
  return {
    id: "466113c2-dc61-4b9c-9289-aed9f65e1b13",
    title: "На бетон",
    description: null,
    targetAmountKopecks: TARGET,
    collectedAmountKopecks,
    percent: 0,
    isReached,
  };
}

describe("stagePercentTenths", () => {
  test("округляет вниз до десятой: 4,39% → 4,3", () => {
    // 32 925 ₽ из 750 000 ₽ = 4,39%
    assert.equal(stagePercentTenths("3292500", TARGET), 43);
  });

  test("ноль — ноль", () => {
    assert.equal(stagePercentTenths("0", TARGET), 0);
  });

  test("99,99% не превращается в 100%", () => {
    assert.equal(stagePercentTenths("74992500", TARGET), 999);
  });

  test("ровно цель и больше цели — 100%", () => {
    assert.equal(stagePercentTenths(TARGET, TARGET), 1000);
    assert.equal(stagePercentTenths("90000000", TARGET), 1000);
  });
});

describe("formatStagePercent", () => {
  test("запятая и без лишнего нуля", () => {
    assert.equal(formatStagePercent(43, true), "4,3%");
    assert.equal(formatStagePercent(40, true), "4%");
    assert.equal(formatStagePercent(1000, true), "100%");
  });

  test("ненулевая сумма меньше десятой процента — не «0%»", () => {
    assert.equal(formatStagePercent(0, true), "менее 0,1%");
    assert.equal(formatStagePercent(0, false), "0%");
  });
});

describe("stageFillRatio", () => {
  test("доля от 0 до 1, перевыполнение обрезано", () => {
    assert.equal(stageFillRatio("0", TARGET), 0);
    assert.equal(stageFillRatio("3292500", TARGET), 0.0439);
    assert.equal(stageFillRatio("90000000", TARGET), 1);
  });
});

describe("stageFigures", () => {
  test("собрано 0 — «Станьте первым», шкала пустая", () => {
    assert.deepEqual(plain(stageFigures(goal("0"))), {
      state: "empty",
      headline: "Станьте первым",
      subline: "из 750 000 ₽ · сбор открыт",
      ratio: 0,
      percentValue: 0,
    });
  });

  test("частично — сумма и процент с запятой, пробелы неразрывные", () => {
    assert.deepEqual(plain(stageFigures(goal("3292500"))), {
      state: "progress",
      headline: "32 925 ₽",
      subline: "из 750 000 ₽ · 4,3%",
      ratio: 0.0439,
      percentValue: 4.3,
    });
  });

  test("ровно цель — «Собрано!», шкала полная", () => {
    const figures = plain(stageFigures(goal(TARGET, true)));

    assert.equal(figures.state, "reached");
    assert.equal(figures.headline, "Собрано!");
    assert.equal(figures.subline, "750 000 ₽ из 750 000 ₽");
    assert.equal(figures.ratio, 1);
    assert.equal(figures.percentValue, 100);
  });

  test("больше цели — тоже «Собрано!», даже если сервер ещё не отметил этап", () => {
    const figures = plain(stageFigures(goal("90000000")));

    assert.equal(figures.state, "reached");
    assert.equal(figures.subline, "900 000 ₽ из 750 000 ₽");
    assert.equal(figures.ratio, 1);
  });

  test("сумма, «₽» и «из» не разрываются переносом", () => {
    const { headline, subline } = stageFigures(goal("3292500"));

    assert.equal(headline, "32\u00A0925\u00A0₽");
    assert.equal(subline, "из\u00A0750\u00A0000\u00A0₽\u00A0· 4,3%");
  });
});
