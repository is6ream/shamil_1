import type { Metadata, Viewport } from "next";
import { Golos_Text, Lora } from "next/font/google";

import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
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
  themeColor: "#0A3367",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${lora.variable} ${golos.variable}`}>
      <body>{children}</body>
    </html>
  );
}
