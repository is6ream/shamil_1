"use client";

import { useState } from "react";

import { SHARE_TARGETS, SHARE_TEXT, buildShareUrl } from "./share-targets";

interface Props {
  /** Ссылка ведёт на страницу региона, если он известен. */
  readonly regionSlug?: string;
  /** Счётчики репостов по каналам. Показываются только крупные значения. */
  readonly counts?: Readonly<Record<string, number>>;
  /** Отметить репост — счётчик живёт в localStorage до появления эндпоинта. */
  readonly onShared?: (target: string) => void;
  /** Первая кнопка заливается акцентом: WhatsApp — главный канал. */
  readonly highlightFirst?: boolean;
}

/** Ниже этого числа счётчик не показываем: «3 репоста» работает против нас. */
const MIN_VISIBLE_COUNT = 10;

export function ShareLinks({ regionSlug, counts, onShared, highlightFirst = false }: Props) {
  const [isCopied, setCopied] = useState(false);
  const shareUrl = buildShareUrl(regionSlug);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      onShared?.("copy");
    } catch {
      // Буфер обмена закрыт настройками браузера — показываем ссылку,
      // чтобы человек скопировал её руками, а не упирался в тишину.
      setCopied(false);
      window.prompt("Скопируйте ссылку на сбор", shareUrl);
    }
  };

  return (
    <div className="share">
      {SHARE_TARGETS.map((target, index) => {
        const count = counts?.[target.id] ?? 0;

        return (
          <a
            className={highlightFirst && index === 0 ? "lead" : undefined}
            key={target.id}
            href={target.buildUrl(shareUrl, SHARE_TEXT)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onShared?.(target.id);
            }}
          >
            {target.label}
            {count >= MIN_VISIBLE_COUNT ? <b>{count}</b> : null}
          </a>
        );
      })}

      <a
        href={shareUrl}
        onClick={(event) => {
          event.preventDefault();
          void copyLink();
        }}
      >
        {isCopied ? "Ссылка скопирована" : "Скопировать ссылку"}
      </a>
    </div>
  );
}
