import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Личный кабинет", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  redirect("/donor");
}
