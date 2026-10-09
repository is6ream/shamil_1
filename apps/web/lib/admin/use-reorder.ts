"use client";

import { useState } from "react";

import { useToast } from "@/components/admin/ui/Toasts";

import { errorMessage } from "./errors";
import { moveItem, orderBody } from "./reorder";
import { useAdminSession } from "./session";

interface Override<T> {
  /** Для каких данных сервера сделана перестановка: пришли новые — она устарела. */
  readonly base: readonly T[];
  readonly list: readonly T[];
}

/**
 * «Выше/ниже» с сохранением `PUT …/order` (все id). Новый порядок виден
 * сразу; ответ сервера — полный список — становится текущим. Ошибка
 * возвращает прежний порядок и показывает тост.
 */
export function useReorder<T extends { readonly id: string }>(items: readonly T[] | null, orderPath: string) {
  const { client } = useAdminSession();
  const toast = useToast();
  const [override, setOverride] = useState<Override<T> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const list = items === null ? null : override !== null && override.base === items ? override.list : items;

  async function move(index: number, delta: number) {
    if (items === null || list === null || isSaving) {
      return;
    }

    const next = moveItem(list, index, delta);

    setOverride({ base: items, list: next });
    setIsSaving(true);

    try {
      const saved = await client.request<readonly T[]>(orderPath, { method: "PUT", body: orderBody(next) });

      setOverride({ base: items, list: saved });
      toast.success("Порядок сохранён. На сайте обновится в течение минуты.");
    } catch (error: unknown) {
      setOverride(null);
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return { list, move, isSaving };
}
