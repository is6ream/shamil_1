import { CloseIcon } from "@/components/icons/Icons";
import type { SelectOption } from "@/components/admin/ui/Field";
import { clearChip, filterChips } from "@/lib/admin/donation-filter-chips";
import { EMPTY_DONATION_FILTERS } from "@/lib/admin/donations";
import type { DonationFilters } from "@/lib/admin/donations";

import styles from "./donations.module.css";

interface Props {
  readonly filters: DonationFilters;
  readonly regions: readonly SelectOption[];
  readonly onChange: (filters: DonationFilters) => void;
}

/** Что сейчас отфильтровано — плашками с крестиком; «Сбросить всё» рядом. */
export function ActiveFilters({ filters, regions, onChange }: Props) {
  const regionName = (slug: string) => regions.find((region) => region.value === slug)?.label ?? null;
  const chips = filterChips(filters, regionName);

  if (chips.length === 0) {
    return null;
  }

  // Сортировка — не фильтр: «Сбросить всё» её не трогает.
  const reset = { ...EMPTY_DONATION_FILTERS, sort: filters.sort, order: filters.order };

  return (
    <div className={styles.chips} aria-label="Выбранные фильтры" role="group">
      <ul>
        {chips.map((chip) => (
          <li key={chip.key}>
            <span className={styles.chip}>
              {chip.label}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Убрать фильтр: ${chip.label}`}
                onClick={() => onChange(clearChip(filters, chip.key))}
              >
                <CloseIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {chips.length > 1 ? (
        <button type="button" className={styles.chipsReset} onClick={() => onChange(reset)}>
          Сбросить всё
        </button>
      ) : null}
    </div>
  );
}
