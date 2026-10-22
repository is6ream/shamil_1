"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { DonationDrawer } from "@/components/admin/donations/DonationDrawer";
import { DonationFiltersForm } from "@/components/admin/donations/DonationFiltersForm";
import styles from "@/components/admin/donations/donations.module.css";
import { DonationsTable } from "@/components/admin/donations/DonationsTable";
import { ManualDonationDialog } from "@/components/admin/donations/ManualDonationDialog";
import { Button } from "@/components/admin/ui/Button";
import { Pagination } from "@/components/admin/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { useToast } from "@/components/admin/ui/Toasts";
import { countActiveFilters, donationFiltersToParams, exportFileName } from "@/lib/admin/donations";
import type { DonationFilters } from "@/lib/admin/donations";
import { readDonationsUrl, writeDonationsUrl } from "@/lib/admin/donations-url";
import type { DonationsUrlState } from "@/lib/admin/donations-url";
import { saveBlob } from "@/lib/admin/download";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminQuery } from "@/lib/admin/hooks";
import { withQuery } from "@/lib/admin/query";
import { useAdminSession } from "@/lib/admin/session";
import type { AdminDonation, Paged } from "@/lib/admin/types";
import { useRegionOptions } from "@/lib/admin/use-regions";
import { formatCount, plural } from "@/lib/format";

const LIST_HREF = "/admin/donations";

/** `useSearchParams` требует границы Suspense, иначе Next не соберёт страницу. */
export default function DonationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DonationsScreen />
    </Suspense>
  );
}

/**
 * Список пожертвований. Фильтры, страница, открытая карточка и форма
 * «Внести поступление» — в адресе (donations-url.ts); поиск — только здесь,
 * в состоянии компонента: в нём бывают имя и телефон.
 */
function DonationsScreen() {
  const router = useRouter();
  const url = readDonationsUrl(useSearchParams());
  const { client, can } = useAdminSession();
  const toast = useToast();
  const regions = useRegionOptions();
  const [q, setQ] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  // Карточку открыли отсюда, и под ней наша же запись истории: закрывать — «Назад».
  const isOpenedHere = useRef(false);

  const filters: DonationFilters = { ...url.filters, q };
  const isManualOpen = url.isManualOpen && can("manualDonations");
  const check = donationFiltersToParams(filters);
  const params = check.ok ? check.params : {};
  const path = withQuery(ADMIN_PATHS.donations, { ...params, page: url.page, pageSize: LIMITS.pageSize });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<AdminDonation>>(path);
  const pageCount = data === null ? 0 : Math.ceil(data.total / data.pageSize);
  const hasFilters = countActiveFilters(filters) > 0;

  function navigate(next: DonationsUrlState, mode: "push" | "replace" = "replace") {
    router[mode](`${LIST_HREF}${writeDonationsUrl(next)}`, { scroll: false });
  }

  function applyFilters(next: DonationFilters) {
    setQ(next.q);
    navigate({ ...url, filters: { ...next, q: "" }, page: 1 });
  }

  function openDonation(id: string) {
    isOpenedHere.current = true;
    navigate({ ...url, openId: id }, "push");
  }

  // Срабатывает и когда панель закрылась сама из-за «Назад» в браузере:
  // адрес тогда уже без карточки, и второй раз уходить назад нельзя.
  function closeDonation() {
    if (url.openId === null) {
      isOpenedHere.current = false;
      return;
    }

    if (isOpenedHere.current) {
      isOpenedHere.current = false;
      router.back();
    } else {
      navigate({ ...url, openId: null });
    }
  }

  function setManualOpen(isOpen: boolean) {
    if (url.isManualOpen !== isOpen) {
      navigate({ ...url, isManualOpen: isOpen });
    }
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
    setManualOpen(false);
    reload();
  }

  const actions = (
    <>
      {can("manualDonations") ? <Button onClick={() => setManualOpen(true)}>Внести поступление</Button> : null}
      {can("exportCsv") ? (
        <Button
          variant="ghost"
          isBusy={isExporting}
          disabled={!check.ok}
          title={hasFilters ? "Выгрузка по текущим фильтрам" : "Выгрузка всех пожертвований"}
          onClick={handleExport}
        >
          {hasFilters ? "Скачать CSV по фильтру" : "Скачать CSV"}
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
        <EmptyState title={hasFilters ? "По этим фильтрам ничего нет." : "Пожертвований пока нет."}>
          <p>
            {hasFilters
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
          <DonationsTable rows={data.items} onOpen={openDonation} />
          <Pagination page={url.page} pageCount={pageCount} onChange={(page) => navigate({ ...url, page })} />
        </>
      ) : null}

      <DonationDrawer id={url.openId} onClose={closeDonation} onChanged={reload} />

      <ManualDonationDialog
        isOpen={isManualOpen}
        regions={regions}
        onClose={() => setManualOpen(false)}
        onCreated={handleCreated}
      />
    </AdminPage>
  );
}
