import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Управление подпиской", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function Page() {
  redirect("/donor");
}
