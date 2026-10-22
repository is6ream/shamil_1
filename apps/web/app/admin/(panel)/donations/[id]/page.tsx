"use client";

import { useParams } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { DonationDetails } from "@/components/admin/donations/DonationDetails";
import { ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import type { AdminDonationDetails } from "@/lib/admin/types";

/** Отдельная страница карточки — для ссылок и закладок; из списка она открывается панелью. */
export default function DonationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, reload } = useAdminQuery<AdminDonationDetails>(ADMIN_PATHS.donation(id));

  return (
    <AdminPage
      title={data ? `Пожертвование № ${data.invoiceNo}` : "Пожертвование"}
      breadcrumbs={[{ href: "/admin/donations", label: "Пожертвования" }]}
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <DonationDetails donation={data} onChanged={reload} /> : null}
    </AdminPage>
  );
}
