import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { FALLBACK_CONTENT, toSiteContent } from "./site-content";

describe("toSiteContent", () => {
  test("незаполненные блоки — хардкод сайта", () => {
    assert.deepEqual(toSiteContent({ hero: null, about: null, requisites: null, contacts: null }), FALLBACK_CONTENT);
  });

  test("лишние поля ответа (id медиатеки, render) в пропсы не попадают; unit: null — без поля", () => {
    const content = toSiteContent({
      hero: {
        ...FALLBACK_CONTENT.hero,
        renderUrl: "https://s3/render.webp",
        renderMediaId: "m1",
        render: null,
      } as never,
      about: {
        ...FALLBACK_CONTENT.about,
        facadeUrl: null,
        facts: [{ value: "500", unit: null, label: "молящихся" }],
      } as never,
      requisites: null,
      contacts: null,
    });

    assert.equal(content.hero.renderUrl, "https://s3/render.webp");
    assert.equal("renderMediaId" in content.hero, false);
    assert.deepEqual(content.about.facts, [{ value: "500", label: "молящихся" }]);
  });

  test("пустые поля блока «Реквизиты» из админки не затирают реквизиты из кода", () => {
    const empty = {
      accountNumber: null,
      bankName: null,
      bik: null,
      correspondentAccount: null,
      kpp: null,
      sbpQrMediaId: null,
      sbpQrUrl: null,
    };
    const content = toSiteContent({ hero: null, about: null, requisites: empty as never, contacts: null });

    assert.deepEqual(content.bank, FALLBACK_CONTENT.bank);
  });

  test("заполненное в админке поле главнее кода", () => {
    const content = toSiteContent({
      hero: null,
      about: null,
      requisites: { ...FALLBACK_CONTENT.bank, bik: "044525225", sbpQrMediaId: null } as never,
      contacts: null,
    });

    assert.equal(content.bank.bik, "044525225");
    assert.equal(content.bank.accountNumber, FALLBACK_CONTENT.bank.accountNumber);
  });
});
