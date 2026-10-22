"use client";

import Link from "next/link";

import { Drawer } from "@/components/admin/ui/Drawer";
import { ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { AdminDonationDetails } from "@/lib/admin/types";

import { DonationDetails } from "./DonationDetails";
import styles from "./donations.module.css";

interface Props {
  /** `null` — панель закрыта, карточку не запрашиваем. */
  readonly id: string | null;
  readonly onClose: () => void;
  /** Перевод подтверждён — список тоже надо перечитать. */
  readonly onChanged: () => void;
}

/** Карточка пожертвования поверх списка; у неё же остаётся отдельный адрес. */
export function DonationDrawer({ id, onClose, onChanged }: Props) {
  const { data, error, isLoading, reload } = useAdminQuery<AdminDonationDetails>(
    id === null ? null : ADMIN_PATHS.donation(id),
  );

  function handleChanged() {
    reload();
    onChanged();
  }

  return (
    <Drawer
      isOpen={id !== null}
      title={data ? `Пожертвование № ${data.invoiceNo}` : "Пожертвование"}
      onClose={onClose}
      actions={
        id === null ? null : (
          <Link href={`/admin/donations/${id}`} className={styles.rowAction}>
            Открыть отдельной страницей
          </Link>
        )
      }
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <DonationDetails donation={data} onChanged={handleChanged} /> : null}
    </Drawer>
  );
}
