"use client";

import type { ReactNode } from "react";

import { ArrowRightIcon } from "@/components/icons/Icons";
import { SECTION_IDS } from "@/lib/content";
import { scrollToSection } from "@/lib/scroll-to-section";

export function DonateLink({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <a
      href={`#${SECTION_IDS.donate}`}
      className={`btn btn-primary ${className ?? ""}`}
      onClick={(event) => {
        if (scrollToSection(SECTION_IDS.donate)) event.preventDefault();
      }}
    >
      {children}
      <ArrowRightIcon />
    </a>
  );
}
