import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DEFAULT_BLOCKS, checkAbout, checkContacts, checkFaq, checkHero, checkRequisites } from "./content";

describe("значения по умолчанию = хардкод сайта", () => {
  test("хардкод проходит собственные проверки", () => {
    assert.ok(checkHero(DEFAULT_BLOCKS.hero).ok);
    assert.ok(checkAbout(DEFAULT_BLOCKS.about).ok);
    assert.ok(checkContacts(DEFAULT_BLOCKS.contacts).ok);
    assert.ok(checkRequisites(DEFAULT_BLOCKS.requisites).ok);
  });

  test("у фактов всегда есть unit (null, если нет)", () => {
    assert.ok(DEFAULT_BLOCKS.about.facts.every((fact) => fact.unit !== undefined));
  });

  test("тело hero — ровно поля API, без renderUrl и прочего", () => {
    const result = checkHero(DEFAULT_BLOCKS.hero);

    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.body).sort(), [
      "badge",
      "helpButton",
      "lede",
      "ledeShort",
      "renderCaption",
      "renderMediaId",
      "title",
      "trust",
    ]);
  });
});

describe("checkHero", () => {
  test("пустой пункт доверия и шесть пунктов", () => {
    const empty = checkHero({ ...DEFAULT_BLOCKS.hero, trust: ["ok", " "] });
    const six = checkHero({ ...DEFAULT_BLOCKS.hero, trust: ["1", "2", "3", "4", "5", "6"] });

    assert.ok(!empty.ok && empty.errors["trust.1"]);
    assert.ok(!six.ok && six.errors.trust);
  });
});

describe("checkAbout", () => {
  test("пустые поля факта — null, текст пустой — null", () => {
    const result = checkAbout({ ...DEFAULT_BLOCKS.about, text: "  ", facts: [{ value: "", unit: "м²", label: " " }] });

    assert.ok(result.ok);
    assert.equal(result.body.text, null);
    assert.deepEqual(result.body.facts, [{ value: null, unit: "м²", label: null }]);
  });
});

describe("checkRequisites", () => {
  test("пробелы из выписки убираются, длины проверяются", () => {
    const ok = checkRequisites({
      ...DEFAULT_BLOCKS.requisites,
      accountNumber: "4070 3810 1234 5678 9012",
      bik: "048073601",
    });
    const bad = checkRequisites({ ...DEFAULT_BLOCKS.requisites, kpp: "12345678", correspondentAccount: "301" });

    assert.ok(ok.ok && ok.body.accountNumber === "40703810123456789012");
    assert.ok(!bad.ok && bad.errors.kpp && bad.errors.correspondentAccount);
  });
});

describe("checkContacts", () => {
  test("Telegram: @ и ссылка t.me срезаются", () => {
    const at = checkContacts({ ...DEFAULT_BLOCKS.contacts, telegramChannel: "@mechetshamil" });
    const link = checkContacts({ ...DEFAULT_BLOCKS.contacts, telegramChannel: "https://t.me/mechetshamil" });

    assert.ok(at.ok && at.body.telegramChannel === "mechetshamil");
    assert.ok(link.ok && link.body.telegramChannel === "mechetshamil");
  });

  test("телефон с буквами и битая почта", () => {
    const result = checkContacts({ ...DEFAULT_BLOCKS.contacts, phone: "звоните", email: "a@b" });

    assert.ok(!result.ok && result.errors.phone && result.errors.email);
  });
});

describe("checkFaq", () => {
  test("пустой ответ — ошибка у конкретного вопроса", () => {
    const result = checkFaq({ items: [{ question: "Куда идут деньги?", answer: "" }] });

    assert.ok(!result.ok && result.errors["items.0.answer"]);
  });
});
