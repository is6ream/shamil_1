"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { DonationFiltersForm } from "@/components/admin/donations/DonationFiltersForm";
import styles from "@/components/admin/donations/donations.module.css";
import { DonationsTable } from "@/components/admin/donations/DonationsTable";
import { ManualDonationDialog } from "@/components/admin/donations/ManualDonationDialog";
import { Button } from "@/components/admin/ui/Button";
import { Pagination } from "@/components/admin/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { useToast } from "@/components/admin/ui/Toasts";
import { EMPTY_DONATION_FILTERS, countActiveFilters, donationFiltersToParams, exportFileName } from "@/lib/admin/donations";
import type { DonationFilters } from "@/lib/admin/donations";
import { saveBlob } from "@/lib/admin/download";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminDonation, Paged } from "@/lib/admin/types";
import { useRegionOptions } from "@/lib/admin/use-regions";
import { formatCount, plural } from "@/lib/format";

export default function DonationsPage() {
  const { client, can } = useAdminSession();
  const toast = useToast();
  const regions = useRegionOptions();
  const [filters, setFilters] = useState<DonationFilters>(EMPTY_DONATION_FILTERS);
  const [page, setPage] = useState(1);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const check = donationFiltersToParams(filters);
  const params = check.ok ? check.params : {};
  const path = withQuery(ADMIN_PATHS.donations, { ...params, page, pageSize: LIMITS.pageSize });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<AdminDonation>>(path);
  const pageCount = data === null ? 0 : Math.ceil(data.total / data.pageSize);

  function applyFilters(next: DonationFilters) {
    setFilters(next);
    setPage(1);
  }

  async function handleExport() {
    setIsExporting(true);

    try {
      const blob = await client.download(withQuery(ADMIN_PATHS.donationsExport, params));

      saveBlob(blob, exportFileName());
    } catch (exportError: unknown) {
      toast.error(errorMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  }

  function handleCreated() {
    setIsManualOpen(false);
    reload();
  }

  const actions = (
    <>
      {can("manualDonations") ? <Button onClick={() => setIsManualOpen(true)}>Внести поступление</Button> : null}
      {can("exportCsv") ? (
        <Button variant="ghost" isBusy={isExporting} onClick={handleExport}>
          Скачать CSV
        </Button>
      ) : null}
    </>
  );

  return (
    <AdminPage
      title="Пожертвования"
      lead="Все поступления: онлайн и внесённые вручную. Время — по Уфе."
      actions={actions}
      isWide
    >
      <DonationFiltersForm
        applied={filters}
        regions={regions}
        canSearchPersonalData={can("donorPersonalData")}
        onApply={applyFilters}
      />

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? (
        <EmptyState title={countActiveFilters(filters) > 0 ? "По этим фильтрам ничего нет." : "Пожертвований пока нет."}>
          <p>
            {countActiveFilters(filters) > 0
              ? "Измените или сбросьте фильтры."
              : "Наличные и переводы по выписке вносятся кнопкой «Внести поступление»."}
          </p>
        </EmptyState>
      ) : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <p className={styles.summary}>
            Найдено {formatCount(data.total)} {plural(data.total, ["запись", "записи", "записей"])}
          </p>
          <DonationsTable rows={data.items} />
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      ) : null}

      <ManualDonationDialog
        isOpen={isManualOpen}
        regions={regions}
        onClose={() => setIsManualOpen(false)}
        onCreated={handleCreated}
      />
    </AdminPage>
  );
}
