import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EMPTY_AUDIT_FILTERS, auditDiff, auditFiltersToParams, formatAuditValue } from "./audit";
import { buildQuery } from "./query";

describe("журнал", () => {
  test("пустые фильтры — пустая query; группа действий уходит как есть", () => {
    assert.equal(buildQuery(auditFiltersToParams(EMPTY_AUDIT_FILTERS)), "");
    assert.equal(buildQuery(auditFiltersToParams({ ...EMPTY_AUDIT_FILTERS, action: "donation.*" })), "?action=donation.*");
  });

  test("деньги — в рублях, скрытое — как есть", () => {
    assert.equal(formatAuditValue("goalKopecks", "24000000000"), "240\u00A0000\u00A0000\u00A0₽");
    assert.equal(formatAuditValue("phone", "[скрыто]"), "[скрыто]");
    assert.equal(formatAuditValue("isActive", false), "нет");
  });

  test("создание: «было» нет; изменение — объединение полей", () => {
    assert.deepEqual(auditDiff(null, { status: "done" }), [{ field: "status", before: null, after: "done" }]);
    assert.deepEqual(auditDiff({ status: "current" }, { status: "done", title: "x" }), [
      { field: "status", before: "current", after: "done" },
      { field: "title", before: "пусто", after: "x" },
    ]);
  });
});
