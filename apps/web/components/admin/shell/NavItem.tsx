import Link from "next/link";

import { SECTION_ICONS } from "@/components/admin/ui/AdminIcons";
import type { AdminSection } from "@/lib/admin/navigation";

import styles from "./Shell.module.css";

interface Props {
  readonly section: AdminSection;
  readonly isCurrent: boolean;
  /** Подпись во вкладке телефона — короткая. */
  readonly isShort?: boolean;
  readonly className?: string;
}

/** Пункт меню: иконка + подпись. В свёрнутом сайдбаре подпись прячется визуально, но читается скринридером. */
export function NavItem({ section, isCurrent, isShort = false, className }: Props) {
  const Icon = SECTION_ICONS[section.icon];

  return (
    <Link
      href={section.href}
      className={className ?? styles.navLink}
      aria-current={isCurrent ? "page" : undefined}
      title={section.label}
    >
      <Icon className={styles.navIcon} />
      <span className={styles.navLabel}>{isShort ? section.shortLabel : section.label}</span>
      {section.isReady ? null : <span className={styles.soon}>скоро</span>}
    </Link>
  );
}
