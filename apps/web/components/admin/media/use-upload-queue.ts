"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { checkUploadFile } from "@/lib/admin/media";
import { useAdminSession } from "@/lib/admin/session";
import type { MediaAsset } from "@/lib/admin/types";

export type UploadStatus = "queued" | "uploading" | "done" | "error";

export interface UploadItem {
  readonly key: number;
  readonly name: string;
  readonly status: UploadStatus;
  /** 0…1. */
  readonly progress: number;
  readonly error: string | null;
  readonly asset: MediaAsset | null;
}

/**
 * Очередь загрузки: файлы уходят строго по одному — с телефона на мобильной
 * сети параллельные 15-мегабайтные загрузки мешают друг другу и чаще рвутся.
 * Файл, не прошедший проверку, сразу помечается ошибкой и не отправляется.
 */
export function useUploadQueue(onUploaded: (asset: MediaAsset) => void) {
  const { client } = useAdminSession();
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  const pending = useRef<{ key: number; file: File }[]>([]);
  const isRunning = useRef(false);
  const nextKey = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const onUploadedRef = useRef(onUploaded);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = useCallback((key: number, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const run = useCallback(async () => {
    if (isRunning.current) {
      return;
    }

    isRunning.current = true;

    for (let next = pending.current.shift(); next !== undefined; next = pending.current.shift()) {
      const { key, file } = next;
      const controller = new AbortController();
      const form = new FormData();

      abort.current = controller;
      form.append("file", file);
      patch(key, { status: "uploading", progress: 0 });

      try {
        const asset = await client.upload<MediaAsset>(
          ADMIN_PATHS.media,
          form,
          (progress) => patch(key, { progress }),
          controller.signal,
        );

        patch(key, { status: "done", progress: 1, asset });
        onUploadedRef.current(asset);
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          break;
        }

        patch(key, { status: "error", error: errorMessage(error) });
      }
    }

    isRunning.current = false;
  }, [client, patch]);

  const add = useCallback(
    (files: readonly File[]) => {
      const added: UploadItem[] = files.map((file) => {
        nextKey.current += 1;
        const key = nextKey.current;
        const problem = checkUploadFile(file);

        if (problem === null) {
          pending.current.push({ key, file });
        }

        return {
          key,
          name: file.name,
          status: problem === null ? "queued" : "error",
          progress: 0,
          error: problem,
          asset: null,
        };
      });

      setItems((current) => [...added, ...current]);
      void run();
    },
    [run],
  );

  const dismiss = useCallback((key: number) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const updateAsset = useCallback((asset: MediaAsset) => {
    setItems((current) => current.map((item) => (item.asset?.id === asset.id ? { ...item, asset } : item)));
  }, []);

  return { items, add, dismiss, updateAsset };
}
