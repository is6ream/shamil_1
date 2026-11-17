import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INITIAL_FORM_STATE,
  patchDonationState,
  PREVIEW_CAPABILITIES,
  buildDonationSubmission,
  formatAmountInput,
  formatPhoneInput,
  validate,
} from "../components/donation/donation-form.model";
import type { DonationCapabilities, DonationFormState } from "../components/donation/donation-form.model";

const state: DonationFormState = {
  ...INITIAL_FORM_STATE,
  amountInput: "500,25",
  personalDataConsent: true,
  recurringConsentAccepted: true,
  donorName: "Тестовый Донор",
  phone: "+7 (917) 123-45-67",
};
const config: DonationCapabilities = {
  ...PREVIEW_CAPABILITIES,
  recurring: {
    methods: ["card"],
    frequencies: ["monthly", "every_friday", "daily"],
    termsUrl: "/test-terms",
    cancellationUrl: "/test-cancellation",
  },
};
const region = { slug: "", source: "form" } as const;

test("разовый перевод сохраняет канал, исключает периодичность и скрытые данные", () => {
  const data = buildDonationSubmission({ ...state, channel: "transfer" }, config, region);
  assert.equal(data?.amountKopecks, 50025);
  assert.equal(data?.paymentMethod, "transfer");
  assert.equal(data?.frequency, null);
  assert.equal(data?.recurringConsentAccepted, false);
  assert.equal(data?.donorName, "");
  assert.equal(data?.donorPhone, "");
});

test("автоплатёж передаёт выбранную периодичность и только доступный метод", () => {
  for (const frequency of ["monthly", "every_friday", "daily"] as const) {
    const data = buildDonationSubmission({
      ...state, donationType: "recurring", recurringMethod: "sbp", frequency, isAnonymous: false,
    }, config, region);
    assert.equal(data?.frequency, frequency);
    assert.equal(data?.paymentMethod, "card");
    assert.equal(data?.donorPhone, "+79171234567");
    assert.equal(data?.recurringConsentAccepted, true);
  }
});

test("автоплатёж требует согласия, документов и доступной конфигурации", () => {
  const recurring = { ...state, donationType: "recurring" } as const;
  assert.equal(buildDonationSubmission(recurring, PREVIEW_CAPABILITIES, region), null);
  assert.equal(buildDonationSubmission(recurring, { ...config, recurring: null }, region), null);
  assert.equal(buildDonationSubmission({ ...recurring, recurringConsentAccepted: false }, config, region), null);
  assert.equal(buildDonationSubmission({ ...recurring, personalDataConsent: false }, config, region), null);
});

test("сумма и телефон проверяются без молчаливого усечения ввода", () => {
  for (const raw of ["0", "-500", "9", "10000001", "12abc"]) {
    assert.ok(validate({ ...state, amountInput: formatAmountInput(raw) }, config).amount, raw);
  }
  assert.equal(validate({ ...state, amountInput: "10000001" }, { oneTimeMethods: ["card"], recurring: null, minRubles: 10 }).amount, undefined);
  for (const phone of ["891712345", "891712345678"]) {
    assert.ok(validate({ ...state, isAnonymous: false, phone: formatPhoneInput(phone) }, config).phone);
  }
  assert.equal(formatPhoneInput("89171234567"), "+7 (917) 123-45-67");
});

test("изменение суммы, графика и способа сбрасывает отдельное согласие", () => {
  for (const changes of [{ amountInput: "1000" }, { frequency: "daily" as const },
    { recurringMethod: "card" as const }, { donationType: "one_time" as const }]) {
    assert.equal(patchDonationState(state, changes).recurringConsentAccepted, false);
    assert.equal(patchDonationState(state, { ...changes, recurringConsentAccepted: true }).recurringConsentAccepted, false);
  }
  assert.equal(patchDonationState(state, { donorName: "Имя" }).recurringConsentAccepted, true);
});
