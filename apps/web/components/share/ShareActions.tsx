"use client";

import { useSyncExternalStore } from "react";

import { Toast } from "@/components/ui/Toast";
import { SHARE } from "@/lib/content";
import { useCopy } from "@/lib/hooks/useCopy";
import { useRegionFromUrl } from "@/lib/hooks/useRegionFromUrl";

import styles from "./ShareActions.module.css";
import { SHARE_TARGETS, SHARE_TEXT, buildShareUrl } from "./share-targets";

const COPY_KEY = "share-link";

const subscribeToNothing = () => () => {};

/**
 * Системное меню «Поделиться» — только на сенсорных устройствах. На
 * десктопе оно тоже бывает (Windows, macOS), но там кнопки мессенджеров
 * и копирование ссылки удобнее, а лишняя кнопка только путает.
 */
function readCanNativeShare(): boolean {
  return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Кнопки репоста (макет v2): WhatsApp главной кнопкой во всю ширину —
 * для Башкортостана, Кавказа и Средней Азии это основной канал, — под ней
 * Telegram и ВКонтакте, ниже «Скопировать ссылку».
 *
 * Пришедший по региональной ссылке репостит её же: у неё своё OG-превью,
 * и земляк попадёт в рейтинг своего региона.
 *
 * Счётчики репостов в макете не показаны — не выводим.
 */
export function ShareActions() {
  const regionSlug = useRegionFromUrl();
  const shareUrl = buildShareUrl(regionSlug ?? undefined);
  const { copiedKey, hasFailed, copy } = useCopy();
  const canNativeShare = useSyncExternalStore(subscribeToNothing, readCanNativeShare, () => false);

  const [whatsapp, ...others] = SHARE_TARGETS;

  const toast =
    copiedKey === COPY_KEY ? SHARE.copied : hasFailed ? `Скопируйте вручную: ${shareUrl}` : null;

  const nativeShare = async () => {
    try {
      await navigator.share({ title: SHARE_TEXT, text: SHARE_TEXT, url: shareUrl });
    } catch {
      // Человек закрыл системное меню — это не ошибка, сообщать не о чем.
    }
  };

  return (
    <div className={styles.actions}>
      {whatsapp === undefined ? null : (
        <a
          className={`btn ${styles.primary}`}
          href={whatsapp.buildUrl(shareUrl, SHARE_TEXT)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {SHARE.whatsapp}
        </a>
      )}

      <div className={styles.row}>
        {others.map((target) => (
          <a
            className={`btn ${styles.secondary}`}
            key={target.id}
            href={target.buildUrl(shareUrl, SHARE_TEXT)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {target.label}
          </a>
        ))}
      </div>

      <div className={styles.links}>
        <button
          className={styles.link}
          type="button"
          onClick={() => {
            void copy(COPY_KEY, shareUrl);
          }}
        >
          {SHARE.copyLink}
        </button>

        {canNativeShare ? (
          <button
            className={styles.link}
            type="button"
            onClick={() => {
              void nativeShare();
            }}
          >
            {SHARE.native}
          </button>
        ) : null}
      </div>

      <Toast message={toast} />
    </div>
  );
}
