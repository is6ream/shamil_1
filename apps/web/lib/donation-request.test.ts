import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DONATION_REQUEST_EVENT, readDonationRequest } from "./donation-request";

function request(detail: unknown): CustomEvent {
  return new CustomEvent(DONATION_REQUEST_EVENT, { detail });
}

describe("readDonationRequest", () => {
  test("сумма из чипа проходит", () => {
    assert.deepEqual(readDonationRequest(request({ amountRubles: 500 })), { amountRubles: 500 });
  });

  test("«Другая сумма» — null", () => {
    assert.deepEqual(readDonationRequest(request({ amountRubles: null })), { amountRubles: null });
  });

  test("мусор в событии игнорируется", () => {
    for (const detail of [null, 500, {}, { amountRubles: "500" }, { amountRubles: 0 }, { amountRubles: 1.5 }]) {
      assert.equal(readDonationRequest(request(detail)), null, JSON.stringify(detail));
    }

    assert.equal(readDonationRequest(new Event(DONATION_REQUEST_EVENT)), null);
  });
});
