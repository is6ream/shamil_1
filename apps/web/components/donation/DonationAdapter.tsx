"use client";

import { createDonation } from "@/lib/api/client";
import { buildCreateDonationBodyFromKopecks } from "@/lib/api/donation-body";
import type { Region } from "@/lib/api/types";
import { readStoredAttribution } from "@/lib/attribution";

import { DonationForm } from "./DonationForm";
import { PREVIEW_CAPABILITIES } from "./donation-form.model";
import type { DonationCapabilities, DonationSubmission } from "./donation-form.model";

// Checkout stays one-time even if a future API advertises recurring support.
const capabilities: DonationCapabilities = { ...PREVIEW_CAPABILITIES, recurring: null };

function bodyFor(data: DonationSubmission) {
  const transfer = data.paymentMethod === "transfer";
  const name = data.isAnonymous ? "" : data.donorName;
  return buildCreateDonationBodyFromKopecks({
    channel: transfer ? "transfer" : "online",
    isAnonymous: data.isAnonymous,
    donorName: name,
    fullName: transfer ? name : "",
    phone: data.isAnonymous ? "" : data.donorPhone,
    personalDataConsent: data.consentAccepted,
    regionSlug: data.region.slug,
    regionSource: data.region.source,
    antispam: data.antispam,
  }, data.amountKopecks, readStoredAttribution());
}

export function DonationAdapter({ regions }: { regions: readonly Region[] }) {
  async function submit(data: DonationSubmission) {
    if (data.donationType !== "one_time") throw new Error("Автоплатежи пока недоступны");
    window.location.assign((await createDonation(bodyFor(data))).redirectUrl);
    return {};
  }

  return <DonationForm regions={regions} capabilities={capabilities} submitDonation={submit} />;
}
