import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { SimplePage } from "@/components/layout/SimplePage";
import { PAGES } from "@/lib/content";
import { OFFER } from "@/lib/legal/offer";

export const metadata: Metadata = {
  title: PAGES.offer.title,
};

export default function Page() {
  return (
    <SimplePage title={OFFER.title} lede={OFFER.subtitle}>
      <LegalDocument document={OFFER} />
    </SimplePage>
  );
}
