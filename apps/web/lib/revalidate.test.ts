import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isAuthorizedRevalidation, parseRevalidateBody } from "./revalidate";

const SECRET = "s3cret-value-long-enough-for-tests";

describe("isAuthorizedRevalidation", () => {
  test("верный Bearer-секрет проходит", () => {
    assert.equal(isAuthorizedRevalidation(`Bearer ${SECRET}`, SECRET), true);
  });

  test("неверный, пустой или без схемы — нет", () => {
    assert.equal(isAuthorizedRevalidation("Bearer wrong", SECRET), false);
    assert.equal(isAuthorizedRevalidation(null, SECRET), false);
    assert.equal(isAuthorizedRevalidation(SECRET, SECRET), false);
  });
});

describe("parseRevalidateBody", () => {
  test("теги из allowlist, дубли схлопываются", () => {
    assert.deepEqual(parseRevalidateBody('{"tags":["stages","news","stages"]}'), {
      ok: true,
      tags: ["stages", "news"],
    });
  });

  test("чужой тег, пустой массив, лишний ключ и не-JSON отклоняются", () => {
    for (const raw of ['{"tags":["admin"]}', '{"tags":[]}', '{"tags":["news"],"x":1}', "tags=news", "[]"]) {
      assert.equal(parseRevalidateBody(raw).ok, false, raw);
    }
  });
});
