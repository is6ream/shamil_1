import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";
import { CONSENT } from "@/lib/legal/consent";

export const metadata: Metadata = {
  title: CONSENT.title,
};

export default function Page() {
  return <LegalPage document={CONSENT} />;
}
