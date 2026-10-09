import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildQuery, withQuery } from "./query";

describe("buildQuery", () => {
  test("пустые, null и undefined не отправляются", () => {
    assert.equal(buildQuery({ status: "", q: "  ", method: null, page: undefined }), "");
  });

  test("значения кодируются", () => {
    assert.equal(buildQuery({ q: "Иван 1", page: 2 }), "?q=%D0%98%D0%B2%D0%B0%D0%BD+1&page=2");
  });

  test("withQuery склеивает путь", () => {
    assert.equal(withQuery("/admin/news", { status: "draft" }), "/admin/news?status=draft");
    assert.equal(withQuery("/admin/news", {}), "/admin/news");
  });
});
