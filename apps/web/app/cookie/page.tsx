import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";
import { COOKIE_POLICY } from "@/lib/legal/cookie";

export const metadata: Metadata = {
  title: COOKIE_POLICY.title,
};

export default function Page() {
  return <LegalPage document={COOKIE_POLICY} />;
}
