import Image from "next/image";
import type { ReactElement } from "react";

import type { PaymentOptionId } from "./donation-form.model";

import styles from "./PaymentMethods.module.css";

/** Оригиналы и результаты проверки — в public/payments/README.md. */
const OFFICIAL_LOGOS: Partial<Record<PaymentOptionId, {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}>> = {
  sbp: { src: "/payments/sbp.svg", width: 42, height: 49 },
  sberpay: { src: "/payments/sberpay.svg", width: 32, height: 32 },
  tpay: { src: "/payments/tpay.svg", width: 50, height: 22 },
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
    return (
      <Image
        {...logo}
        alt=""
        className={`${styles.logo} ${option === "sbp" ? styles.logoSbp : option === "sberpay" ? styles.logoSberPay : styles.logoTPay}`}
        unoptimized
      />
    );
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
