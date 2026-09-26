import type { Region } from "@/lib/api/types";

import { DonationForm } from "./DonationForm";

interface Props {
  readonly regions: readonly Region[];
}

/**
 * Правая колонка главной: форма «Внести вклад».
 *
 * Серверный компонент — клиентской становится только сама форма. Цифры
 * сбора над формой (`WidgetStats`) в макете v2 ушли в левую колонку,
 * в блок «Собрано».
 */
export function DonationWidget({ regions }: Props) {
  return <DonationForm regions={regions} />;
}
