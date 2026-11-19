import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { SimplePage } from "@/components/layout/SimplePage";
import { RECURRING_PAYMENTS } from "@/lib/legal/recurring-payments";
import { OFFER } from "@/lib/legal/offer";

export const metadata: Metadata = {
  title: OFFER.title,
};

export default function Page() {
  return <SimplePage title={OFFER.title} lede={OFFER.subtitle}>
    <p><a href="#recurring-payments">Правила регулярных пожертвований (рекуррентных платежей)</a></p>
    <LegalDocument document={OFFER} />
    <section id="recurring-payments">
      <h2>{RECURRING_PAYMENTS.title}</h2>
      <p>{RECURRING_PAYMENTS.subtitle}</p>
      <LegalDocument document={RECURRING_PAYMENTS} />
    </section>
  </SimplePage>;
}
