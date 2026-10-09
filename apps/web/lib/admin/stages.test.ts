import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { moveItem, orderBody } from "./reorder";
import { EMPTY_STAGE_FORM, checkStage } from "./stages";

describe("moveItem", () => {
  test("вверх и вниз, без мутации исходного", () => {
    const items = ["a", "b", "c"];

    assert.deepEqual(moveItem(items, 2, -1), ["a", "c", "b"]);
    assert.deepEqual(moveItem(items, 0, 1), ["b", "a", "c"]);
    assert.deepEqual(items, ["a", "b", "c"]);
  });

  test("за край — без изменений", () => {
    assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
  });

  test("тело порядка — все id", () => {
    assert.deepEqual(orderBody([{ id: "x" }, { id: "y" }]), { ids: ["x", "y"] });
  });
});

describe("checkStage", () => {
  test("пустые суммы — null («не названа»), пустое описание — null", () => {
    const result = checkStage({ ...EMPTY_STAGE_FORM, title: " Кровля " });

    assert.ok(result.ok);
    assert.deepEqual(result.body, {
      title: "Кровля",
      status: "upcoming",
      description: null,
      budgetKopecks: null,
      spentKopecks: null,
      photoMediaIds: [],
    });
  });

  test("ноль рублей освоено — допустимо", () => {
    const result = checkStage({ ...EMPTY_STAGE_FORM, title: "x", spent: "0" });

    assert.ok(result.ok && result.body.spentKopecks === "0");
  });

  test("смета сверх 2,4 млрд и пустое название", () => {
    const result = checkStage({ ...EMPTY_STAGE_FORM, budget: "2400000001" });

    assert.ok(!result.ok && result.errors.budget && result.errors.title);
  });

  test("31 фото — ошибка", () => {
    const photos = Array.from({ length: 31 }, (_, index) => ({ id: String(index), url: "" }));

    assert.ok(!checkStage({ ...EMPTY_STAGE_FORM, title: "x", photos }).ok);
  });
});
