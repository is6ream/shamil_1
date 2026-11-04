import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { ProfileShell, ProfileShellSkeleton } from "@/components/donor/ProfileShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FALLBACK_CONTENT, getSiteContent } from "@/lib/api/site-content";
import { withFallback } from "@/lib/api/with-fallback";
import { DONOR_CABINET_ENABLED } from "@/lib/donor/endpoints";

/** Личные страницы: поисковикам тут нечего показывать. */
export const metadata: Metadata = {
  title: { default: "Личный кабинет", template: "%s — личный кабинет" },
  robots: { index: false, follow: false },
};

/**
 * Кабинет жертвователя: общая шапка и футер сайта, внутри — меню, карточка
 * профиля и страница раздела. Всё личное грузится в браузере после входа:
 * на сервере сессии нет (access живёт только во вкладке).
 */
export default async function ProfileLayout({ children }: { readonly children: ReactNode }) {
  if (!DONOR_CABINET_ENABLED) {
    notFound();
  }

  const content = await withFallback(getSiteContent(), FALLBACK_CONTENT, "тексты сайта");

  return (
    <>
      <SiteHeader phone={content.contacts.phone} helpButton={content.hero.helpButton} />
      {/* `useSearchParams` (`?vk=` после входа через VK) — только под Suspense. */}
      <Suspense fallback={<ProfileShellSkeleton />}>
        <ProfileShell>{children}</ProfileShell>
      </Suspense>
      <SiteFooter contacts={content.contacts} />
    </>
  );
}
