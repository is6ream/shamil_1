import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACY_POLICY } from "@/lib/legal/privacy";

export const metadata: Metadata = {
  title: PRIVACY_POLICY.title,
};

export default function Page() {
  return <LegalPage document={PRIVACY_POLICY} />;
}
