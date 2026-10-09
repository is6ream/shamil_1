import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  checkRublesInput,
  formatKopecks,
  kopecksToRublesInput,
  percentOf,
  rublesToKopecks,
} from "./money";

describe("rublesToKopecks", () => {
  test("целые рубли", () => {
    assert.equal(rublesToKopecks("1000"), "100000");
  });

  test("копейки через запятую и точку", () => {
    assert.equal(rublesToKopecks("1234,56"), "123456");
    assert.equal(rublesToKopecks("1234.56"), "123456");
  });

  test("один знак после запятой — десятки копеек", () => {
    assert.equal(rublesToKopecks("100,5"), "10050");
  });

  test("копейки без плавающей точки: 100,10 и 0,29", () => {
    assert.equal(rublesToKopecks("100,10"), "10010");
    assert.equal(rublesToKopecks("0,29"), "29");
  });

  test("пробелы разрядов, неразрывный пробел и знак рубля", () => {
    assert.equal(rublesToKopecks("1 234 567"), "123456700");
    assert.equal(rublesToKopecks("1 000 ₽"), "100000");
  });

  test("ведущий ноль не меняет сумму", () => {
    assert.equal(rublesToKopecks("0100"), "10000");
  });

  test("больше двух знаков после запятой — не сумма", () => {
    assert.equal(rublesToKopecks("10,001"), null);
  });

  test("пусто, буквы, минус, две запятые — null", () => {
    for (const raw of ["", "   ", "abc", "12abc", "-5", "1,2,3", ",50"]) {
      assert.equal(rublesToKopecks(raw), null, raw);
    }
  });

  test("большие суммы не теряют точности", () => {
    assert.equal(rublesToKopecks("240000000"), "24000000000");
    assert.equal(rublesToKopecks("99999999999999,99"), "9999999999999999");
  });
});

describe("kopecksToRublesInput", () => {
  test("обратное преобразование для формы", () => {
    assert.equal(kopecksToRublesInput("123456"), "1234,56");
    assert.equal(kopecksToRublesInput("100000"), "1000");
    assert.equal(kopecksToRublesInput("5"), "0,05");
  });

  test("null и мусор — пустое поле", () => {
    assert.equal(kopecksToRublesInput(null), "");
    assert.equal(kopecksToRublesInput("1.5"), "");
  });
});

describe("formatKopecks", () => {
  test("рубли с разрядами, без нулевых копеек", () => {
    assert.equal(formatKopecks("100000"), "1 000 ₽");
  });

  test("копейки показываются, когда не нулевые", () => {
    assert.equal(formatKopecks("123456"), "1 234,56 ₽");
  });

  test("240 млн из BigInt-строки", () => {
    assert.equal(formatKopecks("24000000000"), "240 000 000 ₽");
  });

  test("битая строка — прочерк, а не исключение", () => {
    assert.equal(formatKopecks(null), "—");
    assert.equal(formatKopecks("12.5"), "—");
  });
});

describe("checkRublesInput", () => {
  test("ноль по умолчанию не проходит", () => {
    assert.equal(checkRublesInput("0").ok, false);
  });

  test("потолок суммы", () => {
    const result = checkRublesInput("240000000,01", { max: "24000000000", maxLabel: "240 млн ₽" });

    assert.deepEqual(result, { ok: false, error: "Не больше 240 млн ₽." });
  });

  test("минимум включительно", () => {
    assert.deepEqual(checkRublesInput("0", { min: "0" }), { ok: true, kopecks: "0" });
  });
});

describe("percentOf", () => {
  test("доля с одним знаком", () => {
    assert.equal(percentOf("140000", "24000000000"), 0);
    assert.equal(percentOf("250", "1000"), 25);
    assert.equal(percentOf("1", "3"), 33.3);
  });

  test("нулевая цель — 0", () => {
    assert.equal(percentOf("100", "0"), 0);
  });
});
