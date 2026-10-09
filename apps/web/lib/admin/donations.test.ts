import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMPTY_DONATION_FILTERS,
  canConfirmTransfer,
  checkManualDonation,
  countActiveFilters,
  donationFiltersToParams,
  exportFileName,
  isAmountMismatch,
  looksLikePersonalData,
} from "./donations";
import { buildQuery } from "./query";

describe("donationFiltersToParams", () => {
  test("пустые фильтры — пустая query (значения по умолчанию не шлём)", () => {
    const result = donationFiltersToParams(EMPTY_DONATION_FILTERS);

    assert.ok(result.ok);
    assert.equal(buildQuery(result.params), "");
  });

  test("суммы в рублях уходят копейками строкой", () => {
    const result = donationFiltersToParams({ ...EMPTY_DONATION_FILTERS, minRubles: "1 000", maxRubles: "2500,5" });

    assert.ok(result.ok);
    assert.equal(result.params.minKopecks, "100000");
    assert.equal(result.params.maxKopecks, "250050");
  });

  test("период по Уфе, конец не включительно; dateField только при периоде", () => {
    const withRange = donationFiltersToParams({
      ...EMPTY_DONATION_FILTERS,
      from: "2026-10-01",
      to: "2026-10-01",
      dateField: "paid",
    });
    const withoutRange = donationFiltersToParams({ ...EMPTY_DONATION_FILTERS, dateField: "paid" });

    assert.ok(withRange.ok && withoutRange.ok);
    assert.equal(withRange.params.from, "2026-09-30T19:00:00.000Z");
    assert.equal(withRange.params.to, "2026-10-01T19:00:00.000Z");
    assert.equal(withRange.params.dateField, "paid");
    assert.equal(withoutRange.params.dateField, undefined);
  });

  test("неверная сумма и перепутанные границы — ошибки у полей", () => {
    const result = donationFiltersToParams({
      ...EMPTY_DONATION_FILTERS,
      minRubles: "сто",
      from: "2026-10-05",
      to: "2026-10-01",
    });

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.minRubles !== undefined && result.errors.to !== undefined);
  });

  test("«от» больше «до»", () => {
    const result = donationFiltersToParams({ ...EMPTY_DONATION_FILTERS, minRubles: "500", maxRubles: "100" });

    assert.ok(!result.ok && result.errors.maxRubles !== undefined);
  });

  test("сортировка по сумме по возрастанию", () => {
    const result = donationFiltersToParams({ ...EMPTY_DONATION_FILTERS, sort: "amount", order: "asc" });

    assert.ok(result.ok);
    assert.equal(buildQuery(result.params), "?sort=amount&order=asc");
  });
});

describe("правила списка", () => {
  test("счётчик активных фильтров не считает сортировку", () => {
    assert.equal(countActiveFilters({ ...EMPTY_DONATION_FILTERS, status: "paid", q: "12", sort: "amount" }), 2);
  });

  test("расхождение оплаченной суммы с заказом", () => {
    assert.equal(isAmountMismatch({ amountKopecks: "10000", paidAmountKopecks: "9000" }), true);
    assert.equal(isAmountMismatch({ amountKopecks: "10000", paidAmountKopecks: null }), false);
  });

  test("подтвердить можно только ручной перевод в ожидании", () => {
    assert.equal(canConfirmTransfer({ provider: "manual", status: "pending" }), true);
    assert.equal(canConfirmTransfer({ provider: "robokassa", status: "pending" }), false);
    assert.equal(canConfirmTransfer({ provider: "manual", status: "paid" }), false);
  });

  test("имя файла выгрузки по дате Уфы", () => {
    assert.equal(exportFileName(Date.parse("2026-10-09T20:00:00Z")), "donations-2026-10-10.csv");
  });
});

describe("checkManualDonation", () => {
  const base = {
    amount: "1 000",
    method: "cash" as const,
    comment: "Наличные после джума-намаза",
    paidAt: "2026-10-09T14:00",
    isPaidAtTouched: false,
    regionSlug: "",
    isAnonymous: true,
    donorName: "",
  };
  const now = Date.parse("2026-10-09T10:00:00Z");

  test("минимальное тело: дату и регион не трогали — не отправляем", () => {
    const result = checkManualDonation(base, now);

    assert.ok(result.ok);
    assert.deepEqual(result.body, {
      amountKopecks: "100000",
      method: "cash",
      comment: "Наличные после джума-намаза",
      isAnonymous: true,
    });
  });

  test("подпись уходит только у неанонимного", () => {
    const named = checkManualDonation({ ...base, isAnonymous: false, donorName: " Семья Ахмадуллиных " }, now);
    const anonymous = checkManualDonation({ ...base, donorName: "кто-то" }, now);

    assert.ok(named.ok && anonymous.ok);
    assert.equal(named.body.donorName, "Семья Ахмадуллиных");
    assert.equal("donorName" in anonymous.body, false);
  });

  test("дата по Уфе в будущем — ошибка", () => {
    const result = checkManualDonation({ ...base, isPaidAtTouched: true, paidAt: "2026-10-09T16:00" }, now);

    assert.ok(!result.ok && result.errors.paidAt !== undefined);
  });

  test("дата в прошлом уходит в UTC", () => {
    const result = checkManualDonation({ ...base, isPaidAtTouched: true, paidAt: "2026-10-09T14:00" }, now);

    assert.ok(result.ok);
    assert.equal(result.body.paidAt, "2026-10-09T09:00:00.000Z");
  });

  test("короткий комментарий, сумма сверх 240 млн, пустая подпись", () => {
    const result = checkManualDonation(
      { ...base, comment: "ok", amount: "240000001", isAnonymous: false, donorName: "" },
      now,
    );

    assert.ok(!result.ok);
    assert.ok(!result.ok && result.errors.comment && result.errors.amount && result.errors.donorName);
  });

  test("похожее на телефон в комментарии распознаётся", () => {
    assert.equal(looksLikePersonalData("перевёл +7 917 000-00-00"), true);
    assert.equal(looksLikePersonalData("Наличные, 2 конверта"), false);
  });
});
