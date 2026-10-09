"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/admin/ui/Button";
import { SelectField, TextField } from "@/components/admin/ui/Field";
import type { SelectOption } from "@/components/admin/ui/Field";
import { EMPTY_DONATION_FILTERS, countActiveFilters, donationFiltersToParams } from "@/lib/admin/donations";
import type { DonationFilters, DonationSort } from "@/lib/admin/donations";
import { DONATION_STATUS_LABELS, METHOD_LABELS, PROVIDER_LABELS } from "@/lib/admin/labels";

import styles from "./donations.module.css";

const STATUS_OPTIONS: readonly SelectOption[] = Object.entries(DONATION_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const METHOD_OPTIONS: readonly SelectOption[] = Object.entries(METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PROVIDER_OPTIONS: readonly SelectOption[] = Object.entries(PROVIDER_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const SORT_OPTIONS: readonly SelectOption[] = [
  { value: "createdAt:desc", label: "Сначала новые" },
  { value: "createdAt:asc", label: "Сначала старые" },
  { value: "paidAt:desc", label: "По дате оплаты, новые" },
  { value: "amount:desc", label: "Сначала крупные" },
  { value: "amount:asc", label: "Сначала мелкие" },
];

interface Props {
  readonly applied: DonationFilters;
  readonly regions: readonly SelectOption[];
  /** SA и бухгалтер ищут ещё по имени для сверки и телефону (§13). */
  readonly canSearchPersonalData: boolean;
  readonly onApply: (filters: DonationFilters) => void;
}

/**
 * Фильтры применяются кнопкой, а не на каждый символ: на телефоне
 * так меньше запросов и не прыгает список под пальцем.
 */
export function DonationFiltersForm({ applied, regions, canSearchPersonalData, onApply }: Props) {
  const [draft, setDraft] = useState<DonationFilters>(applied);
  const [isExpanded, setIsExpanded] = useState(countActiveFilters(applied) > 2);
  const check = donationFiltersToParams(draft);
  const errors = check.ok ? {} : check.errors;
  const activeCount = countActiveFilters(applied);

  function set<K extends keyof DonationFilters>(key: K, value: DonationFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (check.ok) {
      onApply(draft);
    }
  }

  function handleReset() {
    setDraft(EMPTY_DONATION_FILTERS);
    onApply(EMPTY_DONATION_FILTERS);
  }

  function handleSort(value: string) {
    const [sort, order] = value.split(":") as [DonationSort, "asc" | "desc"];
    const next = { ...draft, sort, order };

    setDraft(next);

    if (donationFiltersToParams(next).ok) {
      onApply(next);
    }
  }

  const searchHint = canSearchPersonalData
    ? "Номер счёта, подпись, имя для сверки или телефон (от 4 цифр)"
    : "Номер счёта или публичная подпись";

  return (
    <form className={styles.filters} onSubmit={handleSubmit} aria-label="Фильтры пожертвований">
      <div className={styles.filterRow}>
        <TextField
          label="Поиск"
          type="search"
          value={draft.q}
          onChange={(event) => set("q", event.target.value)}
          hint={searchHint}
          autoComplete="off"
        />
        <SelectField
          label="Статус"
          emptyLabel="Все"
          options={STATUS_OPTIONS}
          value={draft.status}
          onChange={(event) => set("status", event.target.value as DonationFilters["status"])}
        />
        <SelectField
          label="Порядок"
          options={SORT_OPTIONS}
          value={`${draft.sort}:${draft.order}`}
          onChange={(event) => handleSort(event.target.value)}
        />
      </div>

      {isExpanded ? (
        <div className={styles.filterGrid}>
          <TextField
            label="Период с"
            type="date"
            value={draft.from}
            onChange={(event) => set("from", event.target.value)}
          />
          <TextField
            label="по (включительно)"
            type="date"
            value={draft.to}
            onChange={(event) => set("to", event.target.value)}
            error={errors.to}
          />
          <SelectField
            label="Период считать по дате"
            options={[
              { value: "created", label: "создания" },
              { value: "paid", label: "оплаты" },
            ]}
            value={draft.dateField}
            onChange={(event) => set("dateField", event.target.value as DonationFilters["dateField"])}
            hint="Даты — по времени Уфы"
          />
          <SelectField
            label="Способ"
            emptyLabel="Любой"
            options={METHOD_OPTIONS}
            value={draft.method}
            onChange={(event) => set("method", event.target.value)}
          />
          <SelectField
            label="Провайдер"
            emptyLabel="Любой"
            options={PROVIDER_OPTIONS}
            value={draft.provider}
            onChange={(event) => set("provider", event.target.value)}
          />
          <SelectField
            label="Регион"
            emptyLabel="Любой"
            options={regions}
            value={draft.regionSlug}
            onChange={(event) => set("regionSlug", event.target.value)}
          />
          <TextField
            label="Сумма от, ₽"
            inputMode="decimal"
            value={draft.minRubles}
            onChange={(event) => set("minRubles", event.target.value)}
            error={errors.minRubles}
          />
          <TextField
            label="Сумма до, ₽"
            inputMode="decimal"
            value={draft.maxRubles}
            onChange={(event) => set("maxRubles", event.target.value)}
            error={errors.maxRubles}
          />
          <TextField
            label="utm_source"
            value={draft.utmSource}
            onChange={(event) => set("utmSource", event.target.value)}
            autoComplete="off"
          />
          <TextField
            label="utm_medium"
            value={draft.utmMedium}
            onChange={(event) => set("utmMedium", event.target.value)}
            autoComplete="off"
          />
          <TextField
            label="utm_campaign"
            value={draft.utmCampaign}
            onChange={(event) => set("utmCampaign", event.target.value)}
            autoComplete="off"
          />
        </div>
      ) : null}

      <div className={styles.filterActions}>
        <Button type="submit" isSmall disabled={!check.ok}>
          Показать
        </Button>
        <Button variant="ghost" isSmall aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)}>
          {isExpanded ? "Меньше фильтров" : "Все фильтры"}
        </Button>
        {activeCount > 0 ? (
          <Button variant="ghost" isSmall onClick={handleReset}>
            Сбросить ({activeCount})
          </Button>
        ) : null}
      </div>
    </form>
  );
}
