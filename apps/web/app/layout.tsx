import type { Metadata, Viewport } from "next";
import { Amiri, Golos_Text, Philosopher } from "next/font/google";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

import "./globals.css";

/**
 * Заголовки и логотип — Philosopher (макет v2). У него только 400 и 700,
 * заголовки идут жирным.
 */
const philosopher = Philosopher({
  variable: "--font-philosopher",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  display: "swap",
});

/** Арабский текст хадиса. Только подмножество `arabic`: латиница не нужна. */
const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic"],
  weight: ["400"],
  display: "swap",
  preload: false,
});

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SLOGAN}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // Главный канал распространения — репост. WhatsApp и Telegram читают
  // именно эти теги, поэтому OG обязателен с первого дня (CLAUDE.md).
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SLOGAN}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SLOGAN}`,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B2548",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${philosopher.variable} ${golos.variable} ${amiri.variable}`}>
      <body>{children}</body>
    </html>
  );
}
