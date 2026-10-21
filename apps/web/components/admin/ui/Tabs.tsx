"use client";

import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import styles from "./Tabs.module.css";

export interface TabItem<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

interface TabsProps<Value extends string> {
  readonly label: string;
  readonly items: readonly TabItem<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly children: ReactNode;
}

const STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * Вкладки по образцу WAI-ARIA: в порядке Tab одна вкладка, между ними —
 * стрелками, Home/End — к крайним. Панель одна: содержимое выбирает родитель.
 */
export function Tabs<Value extends string>({ label, items, value, onChange, children }: TabsProps<Value>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    items.findIndex((item) => item.value === value),
    0,
  );

  function select(index: number) {
    onChange(items[index].value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key in STEP) {
      event.preventDefault();
      select((activeIndex + STEP[event.key] + items.length) % items.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      select(event.key === "Home" ? 0 : items.length - 1);
    }
  }

  return (
    <div>
      <div ref={listRef} role="tablist" aria-label={label} className={styles.list} onKeyDown={handleKeyDown}>
        {items.map((item, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.value}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel`}
              tabIndex={isActive ? 0 : -1}
              className={styles.tab}
              onClick={() => onChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${items[activeIndex].value}`}
        className={styles.panel}
      >
        {children}
      </div>
    </div>
  );
}
