"use client";

import type { KeyboardEvent } from "react";

import { DONATION_MODES } from "@/lib/content";

import styles from "./DonationModeTabs.module.css";

export type DonationMode = "qr" | "form";

const MODES: readonly DonationMode[] = ["qr", "form"];

interface Props {
  readonly value: DonationMode;
  readonly onChange: (mode: DonationMode) => void;
  /** id панели, которой управляют табы — для `aria-controls`. */
  readonly panelId: string;
}

/**
 * Переключатель внутри карточки доната: «По QR-коду» или «Через форму».
 *
 * Клавиатура по паттерну ARIA Tabs: стрелки переключают, в табстоп
 * попадает только выбранный таб.
 */
export function DonationModeTabs({ value, onChange, panelId }: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();

    const current = MODES.indexOf(value);
    const shift = event.key === "ArrowRight" ? 1 : -1;
    const next = MODES[(current + shift + MODES.length) % MODES.length];

    onChange(next);
    document.getElementById(`donation-mode-${next}`)?.focus();
  };

  return (
    <div className={styles.track} role="tablist" aria-label={DONATION_MODES.ariaLabel}>
      {MODES.map((mode) => {
        const isSelected = mode === value;

        return (
          <button
            className={styles.tab}
            key={mode}
            type="button"
            role="tab"
            id={`donation-mode-${mode}`}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => {
              onChange(mode);
            }}
          >
            {DONATION_MODES.labels[mode]}
          </button>
        );
      })}
    </div>
  );
}
