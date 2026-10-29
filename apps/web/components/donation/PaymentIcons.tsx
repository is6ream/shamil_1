import Image from "next/image";
import type { ReactElement } from "react";

import type { PaymentOptionId } from "./donation-form.model";

/**
 * Официальные знаки платёжных систем.
 *
 * Пусто, пока файлы не положены в `public/payments/` из брендбуков (НСПК —
 * СБП, Сбер — SberPay, Т-Банк — T-Pay) или из кабинета Robokassa: чужие
 * логотипы не перерисовываются руками, у каждого свои правила размещения.
 * Пока пути нет — плитка показывает нейтральную иконку ниже.
 */
const OFFICIAL_LOGOS: Partial<Record<PaymentOptionId, string>> = {
  // sbp: "/payments/sbp.svg",
  // sberpay: "/payments/sberpay.svg",
  // tpay: "/payments/tpay.svg",
};

const GLYPHS: Record<PaymentOptionId, ReactElement> = {
  sbp: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM20 14v1M14 20h1" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  sberpay: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="m9.8 12.2 1.6 1.6 2.9-3.2" />
    </>
  ),
  tpay: (
    <>
      <path d="M5 8V7a2 2 0 0 1 2-2h10v3" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M20 12h-3.5a1.5 1.5 0 0 0 0 3H20" />
    </>
  ),
  transfer: (
    <>
      <path d="M3.5 9.5 12 4.5l8.5 5" />
      <path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7M3.5 20h17" />
    </>
  ),
};

interface Props {
  readonly option: PaymentOptionId;
}

export function PaymentIcon({ option }: Props) {
  const logo = OFFICIAL_LOGOS[option];

  if (logo !== undefined) {
    return <Image src={logo} alt="" width={24} height={24} unoptimized />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[option]}
    </svg>
  );
}
