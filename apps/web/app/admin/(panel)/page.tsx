"use client";

import Link from "next/link";

import { AdminPage } from "@/components/admin/AdminPage";
import { ADMIN_HOME, ADMIN_SECTIONS } from "@/lib/admin/navigation";
import { useAdminSession } from "@/lib/admin/session";

import styles from "./home.module.css";

/**
 * Главная админки. Пока дашборда нет (ждёт API, шаг F2), здесь —
 * крупные плитки разделов: заказчику с телефона так быстрее, чем через меню.
 */
export default function AdminHomePage() {
  const { state, can } = useAdminSession();
  const name = state.status === "authenticated" ? (state.user.displayName ?? state.user.email) : "";

  const sections = ADMIN_SECTIONS.filter(
    (section) => section.href !== ADMIN_HOME && (section.permission === null || can(section.permission)),
  );

  return (
    <AdminPage title={`Здравствуйте, ${name}`} lead="Выберите, что хотите сделать.">
      <ul className={styles.tiles}>
        {sections.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className={styles.tile}>
              <span>{section.label}</span>
              {section.isReady ? null : <small>скоро</small>}
            </Link>
          </li>
        ))}
      </ul>
    </AdminPage>
  );
}
