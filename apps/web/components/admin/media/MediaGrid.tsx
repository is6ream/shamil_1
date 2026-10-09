import type { ReactNode } from "react";

import type { MediaAsset } from "@/lib/admin/types";

import { AdminImage } from "./AdminImage";
import styles from "./media.module.css";

interface Props {
  readonly items: readonly MediaAsset[];
  /** Кнопки под превью (страница медиатеки). */
  readonly renderActions?: (asset: MediaAsset) => ReactNode;
  /** Режим выбора (модалка): отмеченные id и переключатель. */
  readonly selectedIds?: ReadonlySet<string>;
  readonly onToggle?: (asset: MediaAsset) => void;
}

/** Сетка превью `urls.sm`. В режиме выбора плитка — большая кнопка с отметкой. */
export function MediaGrid({ items, renderActions, selectedIds, onToggle }: Props) {
  return (
    <ul className={styles.grid}>
      {items.map((asset) => {
        const label = asset.altText ?? asset.originalName ?? "Без описания";
        const isSelected = selectedIds?.has(asset.id) ?? false;
        const image = (
          <AdminImage src={asset.urls.sm} alt={asset.altText ?? ""} width={asset.width} height={asset.height} className={styles.thumb} />
        );

        return (
          <li key={asset.id} className={`${styles.tile} ${isSelected ? styles.tileSelected : ""}`}>
            {onToggle ? (
              <button
                type="button"
                className={styles.pick}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Снять выбор" : "Выбрать"}: ${label}`}
                onClick={() => onToggle(asset)}
              >
                {image}
                {isSelected ? <span className={styles.check} aria-hidden="true">✓</span> : null}
              </button>
            ) : (
              image
            )}
            <p className={`${styles.caption} ${asset.altText ? "" : styles.captionMissing}`}>{label}</p>
            {renderActions ? <div className={styles.tileActions}>{renderActions(asset)}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
