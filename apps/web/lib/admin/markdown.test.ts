import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { HTML_MESSAGE, SCHEME_MESSAGE, findMarkdownProblem } from "./markdown";

describe("findMarkdownProblem", () => {
  test("обычный markdown с https-ссылкой проходит", () => {
    assert.equal(findMarkdownProblem("## Залили фундамент\n\nСмотрите [фото](https://mechetshamil.ru/galereya)."), null);
  });

  test("теги, комментарии, autolink — HTML", () => {
    for (const text of ["<script>x</script>", "a </b>", "<!-- x -->", "<?php", "<https://x.ru>"]) {
      assert.equal(findMarkdownProblem(text), HTML_MESSAGE, text);
    }
  });

  test("знак меньше перед цифрой — не HTML", () => {
    assert.equal(findMarkdownProblem("собрали < 10% цели"), null);
  });

  test("javascript: и data: в ссылках и сносках, в том числе спрятанные", () => {
    for (const text of ["[x](javascript:alert(1))", "![i](data:image/png;base64,AA)", "[x]: java&#x09;script:alert(1)", "[x](JaVaScRiPt:1)"]) {
      assert.equal(findMarkdownProblem(text), SCHEME_MESSAGE, text);
    }
  });

  test("mailto и tel разрешены", () => {
    assert.equal(findMarkdownProblem("[почта](mailto:a@b.ru) [тел](tel:+79170000000)"), null);
  });
});
