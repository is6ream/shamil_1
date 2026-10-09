"use client";

import { useMemo } from "react";

import type { SelectOption } from "@/components/admin/ui/Field";

import { ADMIN_PATHS } from "./endpoints";
import { useAdminQuery } from "./hooks";
import type { RegionOption } from "./types";

/**
 * Справочник регионов из публичного `/regions` для фильтра и форм:
 * сначала страны, потом субъекты РФ по алфавиту. Не загрузился — пустой
 * список: регион необязателен, форма работает и без него.
 */
export function useRegionOptions(): readonly SelectOption[] {
  const { data } = useAdminQuery<readonly RegionOption[]>(ADMIN_PATHS.regions);

  return useMemo(() => {
    if (data === null) {
      return [];
    }

    const countries = data.filter((region) => region.type === "country");
    const subjects = [...data.filter((region) => region.type === "subject")].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );

    return [...countries, ...subjects].map((region) => ({ value: region.slug, label: region.name }));
  }, [data]);
}
