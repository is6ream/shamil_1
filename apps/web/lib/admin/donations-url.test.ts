import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EMPTY_DONATION_FILTERS } from "./donations";
import { EMPTY_DONATIONS_URL, readDonationsUrl, writeDonationsUrl } from "./donations-url";
import type { DonationsUrlState } from "./donations-url";

const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

function read(query: string): DonationsUrlState {
  return readDonationsUrl(new URLSearchParams(query));
}

describe("readDonationsUrl", () => {
  test("пустой адрес — фильтры по умолчанию, первая страница, ничего не открыто", () => {
    assert.deepEqual(read(""), EMPTY_DONATIONS_URL);
    assert.deepEqual(EMPTY_DONATIONS_URL.filters, EMPTY_DONATION_FILTERS);
  });

  test("читает все фильтры", () => {
    const state = read(
      "status=paid&from=2026-10-01&to=2026-10-20&date=paid&method=sbp&provider=robokassa&min=100&max=5000" +
        "&utm_source=telegram&utm_medium=post&utm_campaign=ramadan&region=02&sort=amount&order=asc&page=3",
    );

    assert.deepEqual(state.filters, {
      ...EMPTY_DONATION_FILTERS,
      status: "paid",
      from: "2026-10-01",
      to: "2026-10-20",
      dateField: "paid",
      method: "sbp",
      provider: "robokassa",
      minRubles: "100",
      maxRubles: "5000",
      utmSource: "telegram",
      utmMedium: "post",
      utmCampaign: "ramadan",
      regionSlug: "02",
      sort: "amount",
      order: "asc",
    });
    assert.equal(state.page, 3);
  });

  test("поиск q из адреса не читается никогда: в нём ПДн", () => {
    assert.equal(read("q=79991234567").filters.q, "");
  });

  test("мусор отбрасывается по одному полю, остальное остаётся", () => {
    const state = read(
      "status=refunded&from=2026-13-40&to=вчера&date=ever&method=Sb%20p&provider=x;y&min=сто&max=-5" +
        "&region=../etc&sort=name&order=up&page=0&utm_source=a%40b.ru&utm_campaign=" +
        "x".repeat(101) +
        "&utm_medium=ok",
    );

    assert.deepEqual(state.filters, { ...EMPTY_DONATION_FILTERS, utmMedium: "ok" });
    assert.equal(state.page, 1);
  });

  test("суммы нормализуются: пробелы разрядов и копейки через запятую", () => {
    const state = read("min=1%20000&max=2500.5");

    assert.equal(state.filters.minRubles, "1000");
    assert.equal(state.filters.maxRubles, "2500,50");
  });

  test("метки — без пробелов по краям и в нижнем регистре, кириллица разрешена", () => {
    assert.equal(read("utm_source=%20Telegram%20").filters.utmSource, "telegram");
    assert.equal(read("utm_campaign=Рамадан").filters.utmCampaign, "рамадан");
  });

  test("номер страницы — целое от 1, огромное и дробное не принимаем", () => {
    assert.equal(read("page=2").page, 2);
    assert.equal(read("page=2.5").page, 1);
    assert.equal(read("page=1e9").page, 1);
    assert.equal(read("page=100000").page, 1);
  });

  test("открытая карточка — только UUID, «Внести поступление» — только manual=1", () => {
    assert.equal(read(`donation=${ID}`).openId, ID);
    assert.equal(read("donation=1042").openId, null);
    assert.equal(read("manual=1").isManualOpen, true);
    assert.equal(read("manual=yes").isManualOpen, false);
  });
});

describe("writeDonationsUrl", () => {
  test("по умолчанию — пустая строка", () => {
    assert.equal(writeDonationsUrl(EMPTY_DONATIONS_URL), "");
  });

  test("значения по умолчанию в адрес не попадают", () => {
    const query = writeDonationsUrl({
      ...EMPTY_DONATIONS_URL,
      filters: { ...EMPTY_DONATION_FILTERS, status: "pending", dateField: "paid" },
    });

    assert.equal(query, "?status=pending");
  });

  test("q не пишется в адрес ни при каких условиях", () => {
    const query = writeDonationsUrl({
      ...EMPTY_DONATIONS_URL,
      filters: { ...EMPTY_DONATION_FILTERS, q: "Иванов +7 999 123-45-67", status: "paid" },
    });

    assert.equal(query, "?status=paid");
  });

  test("dateField пишется только вместе с периодом", () => {
    const query = writeDonationsUrl({
      ...EMPTY_DONATIONS_URL,
      filters: { ...EMPTY_DONATION_FILTERS, from: "2026-10-01", dateField: "paid" },
    });

    assert.equal(query, "?from=2026-10-01&date=paid");
  });

  test("невалидное в состоянии не пишется", () => {
    const query = writeDonationsUrl({
      ...EMPTY_DONATIONS_URL,
      page: 0,
      openId: "1042",
      filters: { ...EMPTY_DONATION_FILTERS, minRubles: "сто", regionSlug: "../x" },
    });

    assert.equal(query, "");
  });

  test("туда и обратно — то же состояние", () => {
    const state: DonationsUrlState = {
      filters: {
        ...EMPTY_DONATION_FILTERS,
        status: "failed",
        from: "2026-09-01",
        to: "2026-09-30",
        dateField: "paid",
        method: "bank_transfer",
        provider: "manual",
        minRubles: "1234,56",
        maxRubles: "100000",
        utmSource: "qr-баннер",
        utmMedium: "offline",
        utmCampaign: "pjatnica",
        regionSlug: "kz",
        sort: "paidAt",
        order: "desc",
      },
      page: 4,
      openId: ID,
      isManualOpen: true,
    };

    assert.deepEqual(readDonationsUrl(new URLSearchParams(writeDonationsUrl(state))), state);
  });
});
