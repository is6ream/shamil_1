import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";
import { OFFER } from "@/lib/legal/offer";

export const metadata: Metadata = {
  title: OFFER.title,
};

export default function Page() {
  return <LegalPage document={OFFER} />;
}
