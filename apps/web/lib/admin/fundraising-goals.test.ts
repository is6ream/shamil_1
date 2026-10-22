import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  changedGoalBody,
  checkGoalForm,
  goalActions,
  initialGoalForm,
  previewGoal,
  signedRublesToKopecks,
} from "./fundraising-goals";
import type { GoalForm } from "./fundraising-goals";
import type { FundraisingGoalRecord } from "./types";

const FORM: GoalForm = {
  title: "  На кирпичи ",
  description: "",
  target: "700 000",
  startsAt: "2026-10-22T09:00",
  endsAt: "",
  adjustment: "0",
};

const RECORD: FundraisingGoalRecord = {
  id: "g1",
  title: "На кирпичи",
  description: null,
  status: "DRAFT",
  targetAmountKopecks: "70000000",
  manualAdjustmentKopecks: "-150000",
  paidAmountKopecks: "1000000",
  collectedAmountKopecks: "850000",
  percent: 1,
  isReached: false,
  startsAt: "2026-10-22T04:00:00.000Z",
  endsAt: null,
  completedAt: null,
  createdAt: "2026-10-22T04:00:00.000Z",
  updatedAt: "2026-10-22T04:00:00.000Z",
  createdBy: null,
  updatedBy: null,
};

describe("checkGoalForm", () => {
  test("рубли → копейки, время по Уфе → UTC, пустые поля → null", () => {
    assert.deepEqual(checkGoalForm(FORM), {
      ok: true,
      body: {
        title: "На кирпичи",
        description: null,
        targetAmountKopecks: "70000000",
        startsAt: "2026-10-22T04:00:00.000Z",
        endsAt: null,
        manualAdjustmentKopecks: "0",
      },
    });
  });

  test("границы цели: меньше 1 000 ₽ и больше 100 млн ₽ — ошибка", () => {
    assert.ok(!checkGoalForm({ ...FORM, target: "999" }).ok);
    assert.ok(!checkGoalForm({ ...FORM, target: "100 000 001" }).ok);
    assert.ok(checkGoalForm({ ...FORM, target: "1 000" }).ok);
  });

  test("короткое название, HTML, конец раньше начала", () => {
    const result = checkGoalForm({ ...FORM, title: " аб ", description: "<b>", endsAt: "2026-10-01T00:00" });

    assert.ok(!result.ok && result.errors.title && result.errors.description && result.errors.endsAt);
  });

  test("отрицательная корректировка допустима", () => {
    const result = checkGoalForm({ ...FORM, adjustment: "−1 500" });

    assert.ok(result.ok && result.body.manualAdjustmentKopecks === "-150000");
  });
});

describe("signedRublesToKopecks", () => {
  test("знак и копейки", () => {
    assert.equal(signedRublesToKopecks("-1 234,5"), "-123450");
    assert.equal(signedRublesToKopecks("–0"), "0");
    assert.equal(signedRublesToKopecks("abc"), null);
  });
});

describe("правка", () => {
  test("форма из записи и обратно — без изменений, тело пустое", () => {
    const check = checkGoalForm(initialGoalForm(RECORD));

    assert.ok(check.ok);
    assert.deepEqual(changedGoalBody(RECORD, check.body), {});
  });

  test("в теле правки — только изменившиеся поля", () => {
    const check = checkGoalForm({ ...initialGoalForm(RECORD), adjustment: "5000" });

    assert.ok(check.ok);
    assert.deepEqual(changedGoalBody(RECORD, check.body), { manualAdjustmentKopecks: "500000" });
  });
});

describe("goalActions", () => {
  test("архив — только просмотр; в черновик не вернуться", () => {
    assert.deepEqual(goalActions("ARCHIVED"), { canEdit: false, canActivate: false, canComplete: false, canArchive: false });
    assert.deepEqual(goalActions("ACTIVE"), { canEdit: true, canActivate: false, canComplete: true, canArchive: true });
    assert.equal(goalActions("COMPLETED").canActivate, true);
  });
});

describe("previewGoal", () => {
  test("собрано = пожертвования + корректировка, процент вниз", () => {
    assert.deepEqual(previewGoal({ ...FORM, adjustment: "244 999" }, "100"), {
      id: "preview",
      title: "На кирпичи",
      description: null,
      targetAmountKopecks: "70000000",
      collectedAmountKopecks: "24500000",
      percent: 35,
      isReached: false,
    });
  });

  test("отрицательная корректировка не уводит ниже нуля, без цели превью нет", () => {
    assert.equal(previewGoal({ ...FORM, adjustment: "-1 000 000" }, "0")?.collectedAmountKopecks, "0");
    assert.equal(previewGoal({ ...FORM, target: "" }, "0"), null);
  });
});
