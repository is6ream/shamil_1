"use client";

import { useState } from "react";

import { FormActions } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { Pagination } from "@/components/admin/ui/DataTable";
import { Modal } from "@/components/admin/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import type { MediaAsset, Paged } from "@/lib/admin/types";

import styles from "./media.module.css";
import { MediaGrid } from "./MediaGrid";
import { MediaUploader } from "./MediaUploader";

const PICKER_PAGE_SIZE = 24;

interface Props {
  readonly isOpen: boolean;
  readonly title?: string;
  /** Несколько фото (этап, галерея) или одно (обложка, рендер, QR). */
  readonly isMultiple?: boolean;
  /** Сколько ещё можно выбрать (лимит 30 фото этапа). */
  readonly maxCount?: number;
  readonly onClose: () => void;
  readonly onSelect: (assets: readonly MediaAsset[]) => void;
}

/**
 * «Выбрать из медиатеки»: сетка с отметками и «загрузить новое» там же.
 * Только что загруженное сразу отмечается — обычно его и хотели вставить.
 */
export function MediaPicker({ isOpen, title = "Выбрать из медиатеки", ...rest }: Props) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={rest.onClose} isDismissible isWide>
      <PickerBody {...rest} />
    </Modal>
  );
}

function PickerBody({ isMultiple = false, maxCount, onClose, onSelect }: Omit<Props, "isOpen" | "title">) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<readonly MediaAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const path = withQuery(ADMIN_PATHS.media, { page, pageSize: PICKER_PAGE_SIZE });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<MediaAsset>>(path);
  const selectedIds = new Set(selected.map((asset) => asset.id));
  const isFull = maxCount !== undefined && selected.length >= maxCount;

  function toggle(asset: MediaAsset) {
    if (!isMultiple) {
      setSelected([asset]);
      return;
    }

    setSelected((current) => {
      if (current.some((item) => item.id === asset.id)) {
        return current.filter((item) => item.id !== asset.id);
      }

      return maxCount !== undefined && current.length >= maxCount ? current : [...current, asset];
    });
  }

  function handleUploaded(asset: MediaAsset) {
    toggle(asset);
    if (page === 1) {
      reload();
    } else {
      setPage(1);
    }
  }

  return (
    <div className={styles.picker}>
      {isUploading ? (
        <MediaUploader onUploaded={handleUploaded} />
      ) : (
        <Button variant="ghost" isSmall onClick={() => setIsUploading(true)}>
          Загрузить новое фото
        </Button>
      )}
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? <EmptyState title="В медиатеке пока нет фото." /> : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <MediaGrid items={data.items} selectedIds={selectedIds} onToggle={toggle} />
          <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </>
      ) : null}
      {isFull ? <p className={styles.pickerNote}>Выбрано максимум — {maxCount}.</p> : null}
      <FormActions>
        <Button disabled={selected.length === 0} onClick={() => onSelect(selected)}>
          {isMultiple && selected.length > 0 ? `Выбрать (${selected.length})` : "Выбрать"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </FormActions>
    </div>
  );
}
