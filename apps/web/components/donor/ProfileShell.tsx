"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/admin/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { kopecksToRubDisplay } from "@/lib/money";
import { DONOR_PATHS, PROFILE_PATHS } from "@/lib/donor/endpoints";
import { useDonorQuery } from "@/lib/donor/hooks";
import { VK_OUTCOME_MESSAGES, displayName, initials, memberSinceLabel, readVkOutcome } from "@/lib/donor/profile-view";
import { restoreDonorSession, signOutDonor, useDonorSession } from "@/lib/donor/session";
import type { DonorProfile, DonorSummary } from "@/lib/donor/types";

import { DonorLoginDialog } from "./DonorLoginDialog";
import styles from "./ProfileShell.module.css";
import { Skeleton } from "./Skeleton";

/** Пункты меню кабинета. Разделы этапов 2–4 добавятся сюда же. */
const NAV_ITEMS = [
  { href: PROFILE_PATHS.home, label: "Моя помощь" },
  { href: "/profile/subscriptions", label: "Регулярная помощь" },
  { href: PROFILE_PATHS.settings, label: "Настройки" },
] as const;

const TOAST_MS = 4000;

/**
 * Оболочка кабинета. Без входа показывает окно входа поверх скелета и после
 * входа остаётся на той же странице (у mechet.ru — редирект на главную, так
 * не делаем). `?vk=` от колбэка VK превращается в понятный текст и
 * убирается из адреса.
 */
export function ProfileShell({ children }: { readonly children: ReactNode }) {
  const session = useDonorSession("required");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vkOutcome = readVkOutcome(searchParams.get("vk"));
  // Запоминаем при открытии: параметр из адреса сразу убирается.
  const [initialVk] = useState(() => vkOutcome);
  const loginNotice = initialVk === null || initialVk === "linked" ? null : VK_OUTCOME_MESSAGES[initialVk];
  const [isToastHidden, setToastHidden] = useState(false);
  const toast = session.status === "authenticated" && initialVk !== null && !isToastHidden ? VK_OUTCOME_MESSAGES[initialVk] : null;

  useEffect(() => {
    if (vkOutcome === null || session.status === "loading" || session.status === "idle") {
      return;
    }

    // Параметр одноразовый: после перезагрузки страницы сообщение не нужно.
    router.replace(pathname, { scroll: false });
  }, [vkOutcome, session.status, router, pathname]);

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timer = setTimeout(() => setToastHidden(true), TOAST_MS);

    return () => clearTimeout(timer);
  }, [toast]);

  if (session.status === "authenticated") {
    return (
      <main className={styles.main}>
        <ProfileCard profile={session.profile} />
        <ProfileNav pathname={pathname} />
        <div className={styles.content}>{children}</div>
        <Toast message={toast} />
      </main>
    );
  }

  if (session.status === "unavailable") {
    return (
      <main className={styles.main}>
        <div className={`card ${styles.problem}`} role="alert">
          <p>{session.message}</p>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => void restoreDonorSession(true)}>
            Попробовать ещё раз
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <ProfileShellSkeleton />
      {session.status === "anonymous" ? (
        <DonorLoginDialog
          isOpen
          returnTo={pathname}
          notice={loginNotice}
          onSignedIn={() => undefined}
          onClose={() => router.push("/")}
        />
      ) : null}
    </>
  );
}

export function ProfileShellSkeleton() {
  return (
    <main className={styles.main} aria-busy="true">
      <section className={`card ${styles.card}`} aria-label="Профиль">
        <Skeleton width="56px" height="56px" className={styles.round} />
        <Skeleton width="60%" height="20px" />
        <Skeleton width="80%" />
        <Skeleton width="50%" height="36px" />
      </section>
      <nav className={styles.nav} aria-label="Разделы кабинета">
        <Skeleton height="40px" />
        <Skeleton height="40px" />
      </nav>
      <div className={styles.content}>
        <Skeleton width="40%" height="32px" />
        <Skeleton height="72px" />
        <Skeleton height="72px" />
      </div>
    </main>
  );
}

function ProfileNav({ pathname }: { readonly pathname: string }) {
  const router = useRouter();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  return (
    <nav className={styles.nav} aria-label="Разделы кабинета">
      <ul className={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link className={styles.navLink} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <button className={styles.navLink} type="button" aria-haspopup="dialog" onClick={() => setConfirmOpen(true)}>
            Выход
          </button>
        </li>
      </ul>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Выйти из кабинета?"
        description="На этом устройстве понадобится снова войти по коду или через VK."
        confirmLabel="Выйти"
        isBusy={isLeaving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setLeaving(true);
          void signOutDonor().then(() => router.push("/"));
        }}
      />
    </nav>
  );
}

function ProfileCard({ profile }: { readonly profile: DonorProfile }) {
  const { data: summary } = useDonorQuery<DonorSummary>(DONOR_PATHS.summary);
  const name = displayName(profile);

  return (
    <section className={`card ${styles.card}`} aria-label="Профиль">
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(profile)}
        </span>
        <div className={styles.who}>
          {name === null ? (
            <Link className={styles.muted} href={PROFILE_PATHS.settings}>
              Имя не указано
            </Link>
          ) : (
            <b className={styles.name}>{name}</b>
          )}
          <span className={styles.muted}>{profile.email ?? "Email не указан"}</span>
        </div>
      </div>
      {summary === null ? (
        <div className={styles.stats}>
          <Skeleton width="70%" />
          <Skeleton width="50%" height="36px" />
        </div>
      ) : (
        <div className={styles.stats}>
          <span className={styles.label}>Всего помощи за {summary.year}</span>
          <span className={`amount amount-md ${styles.total}`}>{kopecksToRubDisplay(summary.yearTotalKopecks)}</span>
          <span className={styles.muted}>Пожертвований: {summary.donationsCount}</span>
          <span className={styles.muted}>{memberSinceLabel(summary.memberSince)}</span>
          {summary.hasActiveSubscription ? <span className={styles.badge}>Помогаю регулярно</span> : null}
        </div>
      )}
    </section>
  );
}
