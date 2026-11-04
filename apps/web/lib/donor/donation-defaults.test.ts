import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { donationDefaults } from "./donation-defaults";
import type { DonorProfile } from "./types";

const PROFILE: DonorProfile = {
  id: "d1",
  email: "i@example.test",
  vkLinked: false,
  firstName: "Ильдар",
  lastName: "Хасанов",
  middleName: null,
  phone: "+79171234567",
  region: { id: "r1", slug: "02", name: "Башкортостан", type: "subject", countryName: "Россия" },
  city: "Уфа",
  showInFeed: true,
  createdAt: "2026-10-27T10:00:00Z",
};

describe("donationDefaults", () => {
  test("согласие на показ в ленте — имя, телефон и регион подставляются, анонимность снята", () => {
    assert.deepEqual(donationDefaults(PROFILE, false), {
      isAnonymous: false,
      donorName: "Ильдар Хасанов",
      phone: "+79171234567",
      regionSlug: "02",
    });
  });

  test("без согласия — анонимно и без имени и телефона", () => {
    const result = donationDefaults({ ...PROFILE, showInFeed: false }, false);

    assert.equal(result.isAnonymous, true);
    assert.equal(result.donorName, "");
    assert.equal(result.phone, "");
  });

  test("региональная ссылка важнее региона из профиля", () => {
    assert.equal(donationDefaults(PROFILE, true).regionSlug, null);
  });
});
