import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  daysBetween,
  daysInclusive,
  formatDateTime,
  formatPlainDate,
  toUfaDateTimeInput,
  ufaDateTimeInputToIso,
  ufaDayKey,
  ufaRangeToIso,
} from "./time";

describe("время по Уфе", () => {
  test("момент UTC выводится по Уфе (+5)", () => {
    assert.equal(formatDateTime("2026-10-08T21:30:00.000Z"), "09.10.2026, 02:30");
  });

  test("день по Уфе сменяется в 19:00 UTC", () => {
    assert.equal(ufaDayKey(Date.parse("2026-10-08T18:59:00Z")), "2026-10-08");
    assert.equal(ufaDayKey(Date.parse("2026-10-08T19:00:00Z")), "2026-10-09");
  });

  test("период по датам: конец не включительно — начало следующего дня", () => {
    assert.deepEqual(ufaRangeToIso("2026-10-01", "2026-10-07"), {
      from: "2026-09-30T19:00:00.000Z",
      to: "2026-10-07T19:00:00.000Z",
    });
  });

  test("пустые границы не отправляются", () => {
    assert.deepEqual(ufaRangeToIso("", ""), {});
  });

  test("datetime-local по Уфе туда и обратно", () => {
    const iso = "2026-10-09T09:15:00.000Z";

    assert.equal(toUfaDateTimeInput(Date.parse(iso)), "2026-10-09T14:15");
    assert.equal(ufaDateTimeInputToIso("2026-10-09T14:15"), iso);
    assert.equal(ufaDateTimeInputToIso(""), null);
  });
});

describe("даты без времени", () => {
  test("строка без пересчёта поясов", () => {
    assert.equal(formatPlainDate("2026-10-01"), "01.10.2026");
  });

  test("дни периода включительно, через границу месяца", () => {
    assert.deepEqual(daysBetween("2026-09-29", "2026-10-02"), [
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    assert.equal(daysInclusive("2026-01-01", "2026-12-31"), 365);
  });
});
