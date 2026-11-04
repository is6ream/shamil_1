import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { displayName, initials, memberSinceLabel, readVkOutcome, safeReturnPath } from "./profile-view";

describe("displayName и initials", () => {
  test("имя и фамилия", () => {
    const profile = { firstName: "Ильдар", lastName: "Хасанов", email: "i@example.test" };

    assert.equal(displayName(profile), "Ильдар Хасанов");
    assert.equal(initials(profile), "ИХ");
  });

  test("без имени — null и буква почты", () => {
    const profile = { firstName: null, lastName: null, email: "donor@example.test" };

    assert.equal(displayName(profile), null);
    assert.equal(initials(profile), "D");
  });

  test("ни имени, ни почты (вход через VK)", () => {
    assert.equal(initials({ firstName: null, lastName: null, email: null }), "?");
  });
});

describe("memberSinceLabel", () => {
  test("месяц в родительном падеже", () => {
    assert.equal(memberSinceLabel("2026-10-27T10:00:00Z"), "С нами с октября 2026");
  });
});

describe("safeReturnPath", () => {
  test("путь сайта оставляем как есть", () => {
    assert.equal(safeReturnPath("/profile/settings"), "/profile/settings");
  });

  test("чужой адрес и протокол-относительный путь — в кабинет", () => {
    for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      assert.equal(safeReturnPath(path), "/profile");
    }
  });
});

describe("readVkOutcome", () => {
  test("только известные значения", () => {
    assert.equal(readVkOutcome("taken"), "taken");
    assert.equal(readVkOutcome("<script>"), null);
    assert.equal(readVkOutcome(null), null);
  });
});
