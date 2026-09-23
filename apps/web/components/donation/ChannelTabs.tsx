"use client";

import type { KeyboardEvent } from "react";

import type { DonationChannel } from "@/lib/api/donation-body";

interface Tab {
  readonly id: DonationChannel;
  readonly label: string;
}

const TABS: readonly Tab[] = [
  { id: "online", label: "Онлайн оплата" },
  { id: "transfer", label: "Расчётный счёт" },
];

interface Props {
  readonly value: DonationChannel;
  readonly onChange: (channel: DonationChannel) => void;
  /** id панели, которой управляют табы — для `aria-controls`. */
  readonly panelId: string;
}

/**
 * Онлайн или перевод по реквизитам.
 *
 * Клавиатура: стрелки переключают таб, как предписывает паттерн ARIA —
 * без этого `role="tab"` объявляет скринридеру поведение, которого нет.
 * В табстоп попадает только выбранный таб (`tabIndex`), внутрь группы
 * человек входит стрелками.
 *
 * Ограничение, о котором стоит помнить: сейчас таб не управляет маршрутом
 * платежа. Провайдер выбирается глобально через `PAYMENT_PROVIDER`, поля
 * `channel` в DTO ещё нет — контракт расширения описан в docs/api-gaps.md.
 */
export function ChannelTabs({ value, onChange, panelId }: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();

    const current = TABS.findIndex((tab) => tab.id === value);
    const shift = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(current + shift + TABS.length) % TABS.length];

    onChange(next.id);
  };

  return (
    <div className="tabs" role="tablist" aria-label="Способ пожертвования">
      {TABS.map((tab) => {
        const isSelected = tab.id === value;

        return (
          <button
            className={`chip${isSelected ? " on" : ""}`}
            key={tab.id}
            type="button"
            role="tab"
            id={`donation-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => {
              onChange(tab.id);
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
