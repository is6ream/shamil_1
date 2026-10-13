import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EMPTY_NEWS_FORM, checkNews } from "./news";

describe("checkNews", () => {
  test("пустой slug не уходит — сервер сделает транслит", () => {
    const result = checkNews({ ...EMPTY_NEWS_FORM, title: " Залили фундамент ", bodyMarkdown: "Текст" });

    assert.ok(result.ok);
    assert.deepEqual(result.body, { title: "Залили фундамент", excerpt: null, bodyMarkdown: "Текст", coverMediaId: null });
  });

  test("slug с заглавными и подчёркиванием — ошибка", () => {
    const result = checkNews({ ...EMPTY_NEWS_FORM, title: "x", bodyMarkdown: "y", slug: "Zalili_fundament" });

    assert.ok(!result.ok && result.errors.slug);
  });

  test("HTML в тексте — тот же текст ошибки, что у сервера", () => {
    const result = checkNews({ ...EMPTY_NEWS_FORM, title: "x", bodyMarkdown: "<b>жирный</b>" });

    assert.ok(!result.ok && result.errors.bodyMarkdown?.startsWith("HTML в тексте не допускается"));
  });

  test("пустой текст", () => {
    assert.ok(!checkNews({ ...EMPTY_NEWS_FORM, title: "x", bodyMarkdown: "   " }).ok);
  });
});
