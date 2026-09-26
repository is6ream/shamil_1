import type { Metadata } from "next";

import { LegalStubPage } from "@/components/layout/LegalStubPage";
import { PAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: PAGES.privacy.title,
};

export default function Page() {
  return <LegalStubPage title={PAGES.privacy.title} />;
}
