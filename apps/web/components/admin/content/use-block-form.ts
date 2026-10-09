"use client";

import { useState } from "react";

import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import type { BlockCheck, BlockErrors } from "@/lib/admin/content";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation, useUnsavedChangesWarning } from "@/lib/admin/hooks";
import type { AdminBlock, ContentBlocks, ContentKey } from "@/lib/admin/types";

interface PutArgs<K extends ContentKey> {
  readonly key: K;
  readonly body: ContentBlocks[K];
}

function putBlock<K extends ContentKey>(client: AdminClient, { key, body }: PutArgs<K>): Promise<AdminBlock<K>> {
  return client.request<AdminBlock<K>>(ADMIN_PATHS.contentBlock(key), { method: "PUT", body });
}

/**
 * Состояние формы блока: черновик, ошибки после первой попытки, сохранение
 * целиком (`PUT`), тост и предупреждение о несохранённом.
 */
export function useBlockForm<K extends ContentKey>(
  key: K,
  initial: ContentBlocks[K],
  check: (block: ContentBlocks[K]) => BlockCheck<ContentBlocks[K]>,
  onSaved: () => void,
) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(putBlock<K>);
  const result = check(draft);
  const errors: BlockErrors = isTouched && !result.ok ? result.errors : {};
  const isDirty = draft !== saved;

  useUnsavedChangesWarning(isDirty);

  function update(change: Partial<ContentBlocks[K]>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  /** `true` — проверка прошла и можно сохранять (для подтверждения реквизитов). */
  function validate(): boolean {
    setIsTouched(true);
    return result.ok;
  }

  async function save(): Promise<boolean> {
    if (!validate() || !result.ok) {
      return false;
    }

    const response = await mutation.run({ key, body: result.body });

    if (response === undefined) {
      return false;
    }

    setSaved(response.data);
    setDraft(response.data);
    setIsTouched(false);
    toast.success(SAVED_MESSAGE);
    onSaved();
    return true;
  }

  return { draft, update, errors, isDirty, validate, save, isPending: mutation.isPending, serverErrors: mutation.errors };
}
