import type { Metadata } from "next";

import { LegalStubPage } from "@/components/layout/LegalStubPage";
import { PAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: PAGES.cookie.title,
};

export default function Page() {
  return <LegalStubPage title={PAGES.cookie.title} />;
}
